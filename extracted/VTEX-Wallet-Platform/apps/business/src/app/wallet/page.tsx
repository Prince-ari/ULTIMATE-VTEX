"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"
import { format as formatMoney, isCurrencyCode } from "@vtex/money"

import type { KaleidoKey } from "@/components/dashboard/KaleidoTile"
import { PageHeader } from "@/components/shell/PageHeader"
import { RibTile } from "@/components/wallet/RibTile"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card"
import { KpiTile } from "@/components/ui/KpiTile"
import { useBusinessContext } from "@/lib/business-context"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type Account = Outputs["wallet"]["accounts"][number]
type Bank = Outputs["wallet"]["bankAccounts"][number]

/** Le maelström chromatique cycle sur les familles de teintes, une par tuile cliquable (RULE 008) ; le RIB principal garde le bleu profond. */
const SUB_PALETTES: KaleidoKey[] = ["forest", "brick", "teal"]

function money(cents: number, currency: string) {
  return isCurrencyCode(currency) ? formatMoney(cents, currency) : `${cents} ${currency}`
}

export default function WalletBusinessPage() {
  const { business, businessId, user } = useBusinessContext()
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [banks, setBanks] = React.useState<Bank[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const [accountRows, bankRows] = await Promise.all([api.wallet.accounts.query({ businessId }), api.wallet.bankAccounts.query({ businessId })])
      setAccounts(accountRows)
      setBanks(bankRows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de charger le wallet.")
    }
  }, [businessId])

  React.useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)) }, [load])

  async function provision(accountId: number) {
    setBusy(accountId)
    try {
      await api.wallet.provisionBankDetails.mutate({ businessId, accountId })
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Génération du RIB impossible.")
    } finally {
      setBusy(null)
    }
  }

  const totalByCurrency = accounts.reduce<Record<string, number>>((acc, account) => ({ ...acc, [account.currency]: (acc[account.currency] ?? 0) + account.availableBalanceCents }), {})
  const mains = banks.filter((bank) => bank.kind === "MAIN").length
  const subs = banks.filter((bank) => bank.kind === "SUB").length
  const canProvision = business.myRole === "owner" || business.myRole === "admin" || user.role === "admin" || user.role === "super_admin"

  return (
    <>
      <PageHeader
        kicker="Finance"
        title="Wallet business"
        description="Les comptes financiers de l'entreprise, leur RIB principal et leurs sous-RIB. Touchez une tuile pour copier l'IBAN : les coordonnées viennent toujours du serveur, jamais d'une copie locale."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile kicker="Solde disponible" value={Object.entries(totalByCurrency).map(([currency, cents]) => money(cents, currency)).join(" · ") || "—"} tone="signature" hint={`${accounts.length} compte${accounts.length > 1 ? "s" : ""}`} />
        <KpiTile kicker="RIB principaux" value={String(mains)} hint="Un par compte" />
        <KpiTile kicker="Sous-RIB" value={String(subs)} hint="IBAN virtuels attribués" />
        <KpiTile kicker="Entreprise" value={business.brandName} hint={business.legalName} />
      </section>

      {error ? <p role="alert" className="mb-6 rounded-[14px] bg-[var(--tint-danger)] px-4 py-3 text-[13px] font-semibold text-[var(--c-danger)]">{error}</p> : null}
      {loading ? <p className="text-[13px] text-[var(--c-t3)]" role="status">Chargement des comptes…</p> : null}

      <div className="space-y-6">
        {accounts.map((account) => {
          const rows = banks.filter((bank) => bank.ledgerAccountId === account.id)
          const main = rows.find((bank) => bank.kind === "MAIN")
          const accountSubs = rows.filter((bank) => bank.kind === "SUB")
          return (
            <Card key={account.id} as="section">
              <CardHeader>
                <div>
                  <CardTitle>{account.label}</CardTitle>
                  <CardSubtitle>Compte {account.currency} · {money(account.availableBalanceCents, account.currency)} disponible{account.reservedBalanceCents > 0 ? ` · ${money(account.reservedBalanceCents, account.currency)} réservé` : ""}</CardSubtitle>
                </div>
                <Badge tone={account.status === "active" ? "positive" : "warm"}>{account.status === "active" ? "Actif" : account.status === "frozen" ? "Gelé" : "Clôturé"}</Badge>
              </CardHeader>
              <CardBody>
                {!main && accountSubs.length === 0 ? (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-[13px] text-[var(--c-t2)]">Aucun RIB n'est encore rattaché à ce compte. Votre gestionnaire l'attribue depuis le Dashboard{canProvision ? ", ou vous pouvez générer le RIB principal maintenant" : ""}.</p>
                    {canProvision ? <Button size="sm" disabled={busy === account.id} onClick={() => void provision(account.id)}>{busy === account.id ? "Génération…" : "Générer le RIB principal"}</Button> : null}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {main ? <RibTile kicker="RIB principal" title={main.label} iban={main.iban} bic={main.bic} bankName={main.bankName} palette="blueDeep" featured /> : null}
                    {accountSubs.map((sub, index) => <RibTile key={sub.id} kicker="Sous-RIB" title={sub.label} iban={sub.iban} bic={sub.bic} bankName={sub.bankName} palette={SUB_PALETTES[index % SUB_PALETTES.length]!} />)}
                  </div>
                )}
              </CardBody>
            </Card>
          )
        })}
      </div>
      {!loading && accounts.length === 0 && !error ? <p className="text-[13px] text-[var(--c-t3)]">Aucun compte n'est encore ouvert pour cette entreprise.</p> : null}
    </>
  )
}
