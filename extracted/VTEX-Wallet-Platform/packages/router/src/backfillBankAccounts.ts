import { isNotNull, eq } from "drizzle-orm"
import { businessWalletAccounts, businesses } from "@vtex/business"
import { walletAccounts } from "@vtex/wallet"
import { db, findActiveMain, ibanFingerprint, normalizeAndValidateIban, syncMainBankAccount, users, type Db } from "@vtex/core"

/**
 * Rattrapage : crée dans `bank_accounts` le RIB principal de chaque compte qui porte déjà un IBAN dans ses colonnes historiques
 * (`wallet_accounts.iban`, `business_wallet_accounts.iban`). Le chiffrement exige la clé du coffre : ce n'est donc pas une migration SQL,
 * c'est cette commande, à lancer après la migration `0010_bank_accounts` : `pnpm --filter @vtex/router db:backfill-banking`.
 * Idempotente (rejouable sans effet) ; ne supprime ni ne modifie jamais les colonnes historiques.
 */
export interface BackfillReport {
  personal: { scanned: number; created: number; unchanged: number; skipped: number }
  professional: { scanned: number; created: number; unchanged: number; skipped: number }
  problems: string[]
}

export async function backfillBankAccounts(executor: Db = db): Promise<BackfillReport> {
  const report: BackfillReport = { personal: { scanned: 0, created: 0, unchanged: 0, skipped: 0 }, professional: { scanned: 0, created: 0, unchanged: 0, skipped: 0 }, problems: [] }

  const personal = await executor
    .select({ id: walletAccounts.id, userId: walletAccounts.userId, currency: walletAccounts.currency, iban: walletAccounts.iban, bic: walletAccounts.bic, firstName: users.firstName, lastName: users.lastName })
    .from(walletAccounts)
    .innerJoin(users, eq(users.id, walletAccounts.userId))
    .where(isNotNull(walletAccounts.iban))
  for (const account of personal) {
    report.personal.scanned += 1
    await backfillOne(executor, report.personal, report.problems, `wallet_accounts #${account.id}`, { walletType: "PERSONAL", holderId: account.userId, ledgerAccountId: account.id, currency: account.currency, accountHolderName: `${account.firstName} ${account.lastName}`.trim() }, account.iban, account.bic)
  }

  const professional = await executor
    .select({ id: businessWalletAccounts.id, businessId: businessWalletAccounts.businessId, currency: businessWalletAccounts.currency, iban: businessWalletAccounts.iban, bic: businessWalletAccounts.bic, legalName: businesses.legalName })
    .from(businessWalletAccounts)
    .innerJoin(businesses, eq(businesses.id, businessWalletAccounts.businessId))
    .where(isNotNull(businessWalletAccounts.iban))
  for (const account of professional) {
    report.professional.scanned += 1
    await backfillOne(executor, report.professional, report.problems, `business_wallet_accounts #${account.id}`, { walletType: "PROFESSIONAL", holderId: account.businessId, ledgerAccountId: account.id, currency: account.currency, accountHolderName: account.legalName }, account.iban, account.bic)
  }
  return report
}

async function backfillOne(executor: Db, counters: BackfillReport["personal"], problems: string[], label: string, ref: Parameters<typeof syncMainBankAccount>[1], iban: string | null, bic: string | null) {
  if (!iban) return
  let normalized: string
  try {
    normalized = normalizeAndValidateIban(iban)
  } catch {
    counters.skipped += 1
    problems.push(`${label} : IBAN historique invalide, non migré (à corriger dans le Dashboard).`)
    return
  }
  const existing = await findActiveMain(executor, ref.walletType, ref.ledgerAccountId)
  if (existing && existing.ibanFingerprint === ibanFingerprint(normalized)) {
    counters.unchanged += 1
    return
  }
  try {
    await syncMainBankAccount(executor, ref, normalized, bic, null)
    counters.created += 1
  } catch (error) {
    counters.skipped += 1
    problems.push(`${label} : ${error instanceof Error ? error.message : "échec"}`)
  }
}

/* Lancement en ligne de commande. */
const invokedDirectly = typeof process !== "undefined" && Boolean(process.argv[1]) && /backfillBankAccounts\.(ts|js)$/.test(process.argv[1]!.replace(/\\/g, "/"))
if (invokedDirectly) {
  void (async () => {
    try {
      await import("dotenv/config")
      const report = await backfillBankAccounts()
      console.info(JSON.stringify(report, null, 2))
      process.exit(report.problems.length > 0 ? 2 : 0)
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  })()
}