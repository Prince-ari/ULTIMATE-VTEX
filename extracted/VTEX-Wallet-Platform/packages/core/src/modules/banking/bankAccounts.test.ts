import { randomBytes, randomInt } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { db } from "../../db/client"
import { bankAccounts } from "../../db/schema"
import { formatIban, generatedIban, generatedVirtualIban, maskIbanValue, normalizeAndValidateIban } from "../../iban"
import { makeUser } from "../../test/fixtures"
import { VaultIntegrityError } from "../vault/crypto"
import { attachBankAccount, bankAccountView, findActiveMain, getBankAccount, insertBankAccount, openIban, revealBankAccountIban, setBankAccountStatus, syncMainBankAccount, updateBankAccount } from "./bankAccounts"

const SAVED = { ...process.env }
// Identifiants de compte de test uniques (la base de test persiste) — jamais un vrai compte.
let nextLedger = 800_000 + Math.floor(Math.random() * 90_000)
const ledger = () => nextLedger++

beforeEach(() => {
  process.env.VTEX_VAULT_KEY = randomBytes(32).toString("base64")
  delete process.env.VTEX_VAULT_KEYS
  delete process.env.VTEX_VAULT_ACTIVE_KEY
})
afterEach(() => {
  process.env = { ...SAVED }
})

const base = (ledgerAccountId: number, holderId = 1) => ({ walletType: "PERSONAL" as const, holderId, ledgerAccountId, currency: "EUR", accountHolderName: "Titulaire Test", actorId: null })

describe("IBAN — génération, format, masque", () => {
  it("les IBAN générés (compte et virtuel) sont valides MOD 97 et distincts", () => {
    expect(() => normalizeAndValidateIban(generatedIban(42))).not.toThrow()
    expect(() => normalizeAndValidateIban(generatedIban(42, "business"))).not.toThrow()
    const virtual = Array.from({ length: 50 }, () => generatedVirtualIban())
    for (const iban of virtual) expect(() => normalizeAndValidateIban(iban)).not.toThrow()
    expect(new Set(virtual).size).toBe(50)
    expect(virtual[0]).toMatch(/^FR\d{2}30006\d{19}$/)
  })

  it("format humain et masque sans jamais laisser plus que pays + clé + quatre derniers", () => {
    expect(formatIban("FR7630006000011234567890189")).toBe("FR76 3000 6000 0112 3456 7890 189")
    expect(maskIbanValue("FR7630006000011234567890189")).toBe("FR76 •••• •••• 0189")
    expect(maskIbanValue("FR76")).toBe("••••")
  })
})

describe("bank_accounts (base réelle)", () => {
  it("chiffre l'IBAN au repos : rien de lisible en base, la vue est masquée, la révélation le restitue", async () => {
    const iban = generatedVirtualIban(() => randomInt(0, 10))
    const row = await insertBankAccount(db, { ...base(ledger()), kind: "MAIN", label: "RIB principal", iban })
    const [raw] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, row.id))
    expect(JSON.stringify(raw)).not.toContain(iban)
    expect(JSON.stringify(raw)).not.toContain(iban.slice(4, 20))
    expect(raw!.ibanLast4).toBe(iban.slice(-4))
    expect(raw!.ibanCountry).toBe("FR")
    const view = bankAccountView(row)
    expect(JSON.stringify(view)).not.toContain(iban)
    expect(view.ibanMasked).toBe(`FR•• •••• •••• ${iban.slice(-4)}`)
    expect(revealBankAccountIban(row)).toEqual({ iban, ibanFormatted: formatIban(iban) })
  })

  it("refuse un IBAN invalide, un doublon (même IBAN, même avec des espaces) et un RIB principal non attribué", async () => {
    const iban = generatedVirtualIban()
    await insertBankAccount(db, { ...base(ledger()), kind: "SUB", label: "Sous-RIB", iban })
    await expect(insertBankAccount(db, { ...base(ledger()), kind: "SUB", label: "Doublon", iban: formatIban(iban) })).rejects.toThrow(/déjà enregistré/)
    await expect(insertBankAccount(db, { ...base(ledger()), kind: "SUB", label: "Faux", iban: "FR7630006000011234567890188" })).rejects.toThrow(/clé de contrôle/)
    await expect(insertBankAccount(db, { ...base(ledger()), holderId: null, ledgerAccountId: null, kind: "MAIN", label: "Orphelin", iban: generatedVirtualIban() })).rejects.toThrow(/toujours attribué/)
  })

  it("un seul RIB principal ACTIF par compte (garde-fou de base) ; désactivé, on peut le remplacer ; réactiver refuse s'il y en a un autre", async () => {
    const account = ledger()
    const first = await insertBankAccount(db, { ...base(account), kind: "MAIN", label: "RIB principal", iban: generatedVirtualIban() })
    await expect(insertBankAccount(db, { ...base(account), kind: "MAIN", label: "Second", iban: generatedVirtualIban() })).rejects.toThrow(/déjà un RIB principal actif/)
    await setBankAccountStatus(db, first.id, "disabled", null)
    expect((await getBankAccount(db, first.id)).disabledAt).toBeInstanceOf(Date)
    const second = await insertBankAccount(db, { ...base(account), kind: "MAIN", label: "Second", iban: generatedVirtualIban() })
    await expect(setBankAccountStatus(db, first.id, "active", null)).rejects.toThrow(/autre RIB principal actif/)
    expect((await findActiveMain(db, "PERSONAL", account))?.id).toBe(second.id)
  })

  it("plusieurs sous-RIB par compte, attribuables, retirables et réattribuables ; un sous-RIB non attribué attend dans le stock", async () => {
    const account = ledger()
    const stock = await insertBankAccount(db, { walletType: "PROFESSIONAL", holderId: null, ledgerAccountId: null, kind: "SUB", label: "Stock", accountHolderName: "VTEX", currency: "EUR", iban: generatedVirtualIban(), actorId: null })
    expect(stock).toMatchObject({ holderId: null, ledgerAccountId: null, status: "active" })
    const attached = await attachBankAccount(db, stock.id, { holderId: 9, ledgerAccountId: account }, null)
    expect(attached).toMatchObject({ holderId: 9, ledgerAccountId: account })
    const second = await insertBankAccount(db, { walletType: "PROFESSIONAL", holderId: 9, ledgerAccountId: account, kind: "SUB", label: "Marketing", accountHolderName: "VTEX", currency: "EUR", iban: generatedVirtualIban(), actorId: null })
    expect(second.id).not.toBe(stock.id)
    const moved = await attachBankAccount(db, stock.id, { holderId: 10, ledgerAccountId: ledger() }, null)
    expect(moved.holderId).toBe(10)
    expect(await attachBankAccount(db, stock.id, null, null)).toMatchObject({ holderId: null, ledgerAccountId: null })
  })

  it("modification : rotation d'IBAN (nouvelle empreinte), BIC validé, champs texte ; un IBAN déjà pris est refusé", async () => {
    const taken = generatedVirtualIban()
    await insertBankAccount(db, { ...base(ledger()), kind: "SUB", label: "Pris", iban: taken })
    const row = await insertBankAccount(db, { ...base(ledger()), kind: "SUB", label: "Avant", iban: generatedVirtualIban() })
    const editor = await makeUser({ role: "admin" })
    const rotated = generatedVirtualIban()
    const updated = await updateBankAccount(db, row.id, { label: "Après", bankName: "Banque Test", bic: "vtexfrppxxx", iban: rotated }, editor.userId)
    expect(updated).toMatchObject({ label: "Après", bankName: "Banque Test", bic: "VTEXFRPPXXX", ibanLast4: rotated.slice(-4), updatedBy: editor.userId })
    expect(openIban(updated)).toBe(rotated)
    expect(updated.ibanFingerprint).not.toBe(row.ibanFingerprint)
    await expect(updateBankAccount(db, row.id, { bic: "12 34" }, null)).rejects.toThrow(/BIC invalide/)
    await expect(updateBankAccount(db, row.id, { iban: taken }, null)).rejects.toThrow(/déjà enregistré/)
    expect(openIban(await getBankAccount(db, row.id))).toBe(rotated)
  })

  it("un chiffré recopié sur une autre ligne est rejeté à la lecture", async () => {
    const a = await insertBankAccount(db, { ...base(ledger()), kind: "SUB", label: "A", iban: generatedVirtualIban() })
    const b = await insertBankAccount(db, { ...base(ledger()), kind: "SUB", label: "B", iban: generatedVirtualIban() })
    await db.update(bankAccounts).set({ ibanEnc: a.ibanEnc }).where(eq(bankAccounts.id, b.id))
    const corrupted = await getBankAccount(db, b.id)
    expect(() => openIban(corrupted)).toThrow(VaultIntegrityError)
  })

  it("écriture jumelée du RIB principal : création, mise à jour, rotation, désactivation, réactivation sans doublon", async () => {
    const user = await makeUser()
    const ref = { walletType: "PERSONAL" as const, holderId: user.userId, ledgerAccountId: ledger(), currency: "EUR", accountHolderName: "Jean Test" }
    const one = generatedVirtualIban()
    const created = await syncMainBankAccount(db, ref, one, "VTEXFRPPXXX", user.userId)
    expect(created.action).toBe("create")
    expect(created.row).toMatchObject({ kind: "MAIN", label: "RIB principal", bic: "VTEXFRPPXXX", createdBy: user.userId })
    expect((await syncMainBankAccount(db, ref, one, "VTEXFRPPXXX", user.userId)).action).toBe("update")
    const two = generatedVirtualIban()
    const rotated = await syncMainBankAccount(db, ref, two, "VTEXFRPPXXX", user.userId)
    expect(rotated.action).toBe("rotate")
    expect(openIban(rotated.row!)).toBe(two)
    expect((await syncMainBankAccount(db, ref, null, null, user.userId)).action).toBe("disable")
    expect((await syncMainBankAccount(db, ref, null, null, user.userId)).action).toBe("none")
    const back = await syncMainBankAccount(db, ref, two, "VTEXFRPPXXX", user.userId)
    expect(back.action).toBe("create")
    expect(back.row!.id).toBe(rotated.row!.id) // réactivé, pas dupliqué
    expect(back.row!.status).toBe("active")
  })
})
