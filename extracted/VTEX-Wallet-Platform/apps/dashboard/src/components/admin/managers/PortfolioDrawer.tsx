"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { SuggestionDialog } from "@/components/admin/suggestions/SuggestionDialog"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegDrawer, LegPill, LegRow, LegSection, LegSocle } from "@/components/ui/legkit"
import { formatDateTime } from "@/lib/adminFormat"
import { MANAGER_ROLE_LABEL, WALLET_TYPE_LABEL, activityLabel } from "@/lib/managerFormat"
import { money } from "@/lib/paymentLinkFormat"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type Sheet = Outputs["admin"]["portfolio"]["wallet"]
export type WalletRef = { walletType: "PERSONAL" | "PROFESSIONAL"; holderId: number }

const STATUS_LABEL: Record<string, string> = { active: "Actif", suspended: "Suspendu", closed: "Clôturé", frozen: "Gelé" }
const STATUS_TONE = (status: string) => (status === "active" ? "ok" : status === "unknown" ? "neutral" : "warn") as "ok" | "warn" | "neutral"
const TYPE_LABEL: Record<string, string> = {
  transfer_internal: "Virement interne", transfer_external: "Virement externe", split_debit: "Partage", split_credit: "Partage", savings_deposit: "Épargne", savings_withdrawal: "Retrait d'épargne",
  card_payment: "Paiement par carte", fee: "Frais", adjustment: "Ajustement", topup: "Recharge", payout: "Virement sortant", transfer: "Virement", invoice_payment: "Facture", payment_link: "Lien de paiement", checkout: "Encaissement", refund: "Remboursement",
}

/**
 * Fiche d'un wallet du portefeuille, LECTURE SEULE : identité, soldes, activité récente, autres gestionnaires, suggestions déjà envoyées.
 * Ni RIB, ni carte, ni clé, ni donnée d'authentification. Ouvrir la fiche est journalisé côté serveur ; un wallet hors du portefeuille est refusé.
 */
export function PortfolioDrawer({ wallet, onClose }: { wallet: WalletRef | null; onClose: () => void }) {
  const [sheet, setSheet] = React.useState<Sheet | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [suggestOpen, setSuggestOpen] = React.useState(false)

  const load = React.useCallback(async (ref: WalletRef) => {
    setLoadError(null)
    try {
      setSheet(await api.admin.portfolio.wallet.query(ref))
    } catch (error) {
      setSheet(null)
      setLoadError(error instanceof Error ? error.message : "Impossible de charger ce wallet.")
    }
  }, [])

  React.useEffect(() => {
    if (!wallet) return // la dernière fiche reste affichée le temps que le tiroir se referme
    setSheet(null); setLoadError(null)
    void load(wallet)
  }, [wallet, load])

  const holder = sheet?.holder
  return (
    <>
      <LegDrawer
        open={wallet !== null}
        onOpenChange={(open) => { if (!open) onClose() }}
        kicker="Fiche wallet · lecture seule"
        title={holder?.name ?? (loadError ? "Wallet indisponible" : "Chargement…")}
        subtitle={holder ? `${WALLET_TYPE_LABEL[holder.walletType]}${holder.subtitle ? ` · ${holder.subtitle}` : ""}` : undefined}
        footer={sheet && holder ? <LegButton icon="pencil" onClick={() => setSuggestOpen(true)}>Envoyer une suggestion</LegButton> : undefined}
      >
        {loadError ? <p role="alert" className="lg-error">{loadError}</p> : null}
        {!sheet && !loadError ? <p className="lg-sub" role="status">Chargement du wallet…</p> : null}

        {sheet && holder ? (
          <>
            <section className="pl-hero" aria-label="Soldes">
              <div className="pl-hero-top">
                <span className="lg-kicker">Solde disponible</span>
                <LegPill tone={STATUS_TONE(holder.status)}>{STATUS_LABEL[holder.status] ?? holder.status}</LegPill>
              </div>
              {sheet.accounts.length === 0 ? <p className="pl-desc">Aucun compte ouvert.</p> : sheet.accounts.map((account) => (
                <p key={account.id} className="mg-balance"><span>{money(account.availableCents, account.currency)}</span><small>{account.label}{account.reservedCents > 0 ? ` · ${money(account.reservedCents, account.currency)} réservé` : ""}{account.status !== "active" ? ` · ${STATUS_LABEL[account.status] ?? account.status}` : ""}</small></p>
              ))}
            </section>

            <section>
              <p className="lg-kicker lg-section-title">Activité récente</p>
              {sheet.recentTransactions.length === 0 ? <p className="lg-hint">Aucune opération pour l'instant.</p> : (
                <div className="mg-wallets" role="list" aria-label="Dernières opérations">
                  {sheet.recentTransactions.map((operation) => (
                    <div key={operation.id} className="mg-wallet" role="listitem">
                      <LegSocle icon={operation.direction === "credit" ? "download" : "wallet"} tone={operation.direction === "credit" ? "green" : "amber"} size="sm" />
                      <span className="mg-wallet-main"><strong>{operation.description ?? TYPE_LABEL[operation.type] ?? operation.type.replace(/_/g, " ")}</strong><small>{TYPE_LABEL[operation.type] ?? operation.type.replace(/_/g, " ")} · {activityLabel(operation.createdAt)}{operation.status !== "completed" ? ` · ${operation.status}` : ""}</small></span>
                      <b className={`mg-amount${operation.direction === "credit" ? " is-credit" : ""}`}>{operation.direction === "credit" ? "+" : "−"}{money(operation.amountCents, operation.currency)}</b>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <p className="lg-kicker lg-section-title">Suggestions envoyées</p>
              {sheet.suggestions.length === 0 ? <p className="lg-hint">Aucune suggestion pour ce wallet.</p> : (
                <div className="lg-panel" role="list" aria-label="Suggestions">
                  {sheet.suggestions.map((suggestion) => (
                    <div key={suggestion.id} className="lg-event" role="listitem">
                      <div className="lg-event-head"><b className="bk-event-title">{suggestion.title}</b><time>{formatDateTime(suggestion.createdAt)}</time></div>
                      <small>{suggestion.sender} · {suggestion.read ? "lue" : "non lue"}</small>
                      <small>{suggestion.body}</small>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <LegSection title="Gestionnaires de ce wallet">
              {sheet.managers.map((manager) => (
                <LegRow key={manager.id} label={manager.isMe ? "Vous" : manager.name} value={MANAGER_ROLE_LABEL[manager.role as keyof typeof MANAGER_ROLE_LABEL] ?? manager.role} />
              ))}
            </LegSection>
            <p className="lg-hint"><LegIcon name="lock" style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 6 }} />Cette fiche est en lecture seule : ni coordonnées bancaires, ni carte, ni clé. Sa consultation est journalisée.</p>
          </>
        ) : null}
      </LegDrawer>
      {holder ? <SuggestionDialog open={suggestOpen} onOpenChange={setSuggestOpen} initialWallets={[{ walletType: holder.walletType, holderId: holder.holderId, name: holder.name, subtitle: holder.subtitle }]} heading={`Suggestion à ${holder.name}`} onSent={async () => { if (wallet) await load(wallet) }} /> : null}
    </>
  )
}
