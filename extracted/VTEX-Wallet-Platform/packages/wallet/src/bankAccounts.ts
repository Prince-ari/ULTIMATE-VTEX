import { and, asc, eq } from "drizzle-orm"
import { NotFoundError, VaultIntegrityError, VaultUnavailableError, ValidationError, bankAccounts, db, renderEpcQrSvg, revealBankAccountIban, type Actor } from "@vtex/core"

/**
 * RIB d'un titulaire, tels qu'il les voit dans son Wallet : son RIB principal et ses sous-RIB ACTIFS, avec l'IBAN complet
 * (c'est précisément ce qu'il partage pour recevoir un virement). Lecture seule : rien ne se modifie depuis le Wallet.
 * Source de vérité unique : `bank_accounts` (le Dashboard écrit, le Wallet lit).
 */
export async function listMyBankAccounts(actor: Actor) {
  const rows = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.walletType, "PERSONAL"), eq(bankAccounts.holderId, actor.id), eq(bankAccounts.status, "active")))
    .orderBy(asc(bankAccounts.kind), asc(bankAccounts.createdAt))
  return rows.map((row) => {
    try {
      const { iban, ibanFormatted } = revealBankAccountIban(row)
      return { id: row.id, kind: row.kind, label: row.label, bankName: row.bankName, accountHolderName: row.accountHolderName, currency: row.currency, iban, ibanFormatted, bic: row.bic, ledgerAccountId: row.ledgerAccountId }
    } catch (error) {
      if (error instanceof VaultUnavailableError || error instanceof VaultIntegrityError) throw new ValidationError("Vos coordonnées bancaires sont momentanément indisponibles.")
      throw error
    }
  })
}

/**
 * QR de réception (norme EPC/SCT) d'un RIB du titulaire, prêt à scanner depuis une application bancaire.
 * EUR uniquement : la norme SEPA n'a pas d'équivalent pour USD/XPF — un compte dans une autre devise n'a pas de QR.
 */
export async function myBankAccountReceiveQr(actor: Actor, bankAccountId: number, amountCents?: number) {
  const [row] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.walletType, "PERSONAL"), eq(bankAccounts.holderId, actor.id), eq(bankAccounts.status, "active")))
    .limit(1)
  if (!row) throw new NotFoundError(`RIB #${bankAccountId} introuvable.`)
  if (row.currency !== "EUR") throw new ValidationError("Le QR de réception n'existe que pour un compte en euros (norme SEPA).")

  try {
    const { iban } = revealBankAccountIban(row)
    const svg = await renderEpcQrSvg({ beneficiaryName: row.accountHolderName, iban, bic: row.bic, amountCents: amountCents ?? null })
    return { svg }
  } catch (error) {
    if (error instanceof VaultUnavailableError || error instanceof VaultIntegrityError) throw new ValidationError("Vos coordonnées bancaires sont momentanément indisponibles.")
    throw error
  }
}
