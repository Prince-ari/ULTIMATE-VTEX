"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { PageHeader } from "@/components/shell/PageHeader"
import { KpiTile } from "@/components/ui/KpiTile"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card"
import { api } from "@/lib/trpc"
import { useBusinessContext } from "@/lib/business-context"
import { parseToStored, useDisplayCurrency } from "@/lib/display-currency"

type Outputs = inferRouterOutputs<AppRouter>
type Link = Outputs["paymentLinks"]["list"][number]
type Account = Outputs["wallet"]["accounts"][number]
type Payment = Outputs["paymentLinks"]["payments"][number]

const STATUS_TONE: Record<Link["status"], BadgeTone> = { active: "positive", expired: "neutral", draft: "gold", disabled: "danger" }
const STATUS_LABEL: Record<Link["status"], string> = { active: "Actif", expired: "Expiré", draft: "Brouillon", disabled: "Suspendu" }
const PAYMENT_TONE: Record<Payment["status"], BadgeTone> = { succeeded: "positive", refunded: "neutral", failed: "danger", canceled: "neutral", pending: "gold", requires_action: "gold", processing: "gold" }
const PAYMENT_LABEL: Record<Payment["status"], string> = { succeeded: "Payé", refunded: "Remboursé", failed: "Refusé", canceled: "Annulé", pending: "En attente", requires_action: "Validation banque", processing: "En cours" }
/** Un socle plein par famille de teinte (le maelström chromatique cycle d'une ligne cliquable à l'autre, RULE 008). */
const SOCLES = ["#97CE5E", "#5FA8D8", "#E5903F", "#BFE3A8"]

const publicUrl = (slug: string) => `${window.location.origin}/pay/${slug}`
const errMsg = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)
const when = (value: Date | string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))

export default function PaymentLinksPage() {
  const { business, businessId } = useBusinessContext()
  const { money, display, symbol } = useDisplayCurrency()
  const [links, setLinks] = React.useState<Link[]>([])
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [mode, setMode] = React.useState<"unique" | "recurring">("recurring")
  const [accountId, setAccountId] = React.useState<number | null>(null)
  const [expires, setExpires] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [created, setCreated] = React.useState<Link | null>(null)
  const [copied, setCopied] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<number | null>(null)
  const [payments, setPayments] = React.useState<Payment[] | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const [rows, accountRows] = await Promise.all([api.paymentLinks.list.query({ businessId }), api.wallet.accounts.query({ businessId })])
      setLinks(rows)
      setAccounts(accountRows)
      setAccountId((current) => current ?? accountRows.find((account) => account.status === "active")?.id ?? null)
    } catch (caught) {
      setError(errMsg(caught, "Impossible de charger les liens de paiement."))
    }
  }, [businessId])

  React.useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)) }, [load])

  React.useEffect(() => {
    if (selected === null) { setPayments(null); return }
    let cancelled = false
    setPayments(null)
    api.paymentLinks.payments.query({ businessId, linkId: selected })
      .then((rows) => { if (!cancelled) setPayments(rows) })
      .catch((caught) => { if (!cancelled) { setPayments([]); setError(errMsg(caught, "Impossible de charger les paiements.")) } })
    return () => { cancelled = true }
  }, [selected, businessId])

  const account = accounts.find((row) => row.id === accountId) ?? null
  const cents = account ? parseToStored(amount, display, account.currency) : null
  const expiresAt = expires ? new Date(`${expires}T23:59:59`) : undefined
  const canCreate = name.trim().length >= 2 && Boolean(cents && cents > 0) && Boolean(account) && (!expiresAt || expiresAt.getTime() > Date.now())

  async function createLink() {
    if (!canCreate || !account || !cents) return
    setBusy(true); setError(null)
    try {
      const before = new Set(links.map((link) => link.id))
      const rows = await api.paymentLinks.create.mutate({
        businessId, name: name.trim(), amountCents: cents, currency: account.currency as "EUR" | "USD" | "XPF", mode,
        targetAccountId: account.id, description: description.trim() || undefined, expiresAt,
      })
      setLinks(rows)
      setCreated(rows.find((row) => !before.has(row.id)) ?? null)
      setName(""); setAmount(""); setDescription(""); setExpires("")
    } catch (caught) {
      setError(errMsg(caught, "Création impossible."))
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(link: Link, status: "active" | "disabled") {
    setError(null)
    try {
      setLinks(await api.paymentLinks.updateStatus.mutate({ businessId, linkId: link.id, status }))
    } catch (caught) {
      setError(errMsg(caught, "Changement impossible."))
    }
  }

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(slug))
      setCopied(slug)
      window.setTimeout(() => setCopied((current) => (current === slug ? null : current)), 1800)
    } catch {
      setError("Copie impossible : sélectionnez l'adresse et copiez-la à la main.")
    }
  }

  const active = links.filter((link) => link.status === "active").length
  const visits = links.reduce((sum, link) => sum + link.visits, 0)
  const paid = links.reduce((sum, link) => sum + link.paid, 0)
  const revenueCents = links.reduce((sum, link) => sum + link.revenueCents, 0)
  const selectedLink = links.find((link) => link.id === selected) ?? null

  return (
    <>
      <PageHeader
        kicker="Encaissements"
        title="Liens de paiement"
        description="Créez un lien, partagez-le où vous voulez : la personne qui paie n'a besoin d'aucun compte. Chaque paiement est vérifié auprès du prestataire de paiement, puis crédité sur le compte que vous avez choisi."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile kicker="Liens actifs" value={String(active)} hint={`${links.length} au total`} tone="signature" />
        <KpiTile kicker="Visites" value={visits.toLocaleString("fr-FR")} hint="toutes périodes" />
        <KpiTile kicker="Paiements réussis" value={String(paid)} hint={visits > 0 ? `${Math.min(100, Math.round((paid / visits) * 100))} % des visites` : "aucune visite"} />
        <KpiTile kicker="Revenus encaissés" value={money(revenueCents, business.currency)} tone="positive" />
      </section>

      {error ? <p role="alert" className="mb-6 rounded-[14px] bg-[var(--tint-danger)] px-4 py-3 text-[13px] font-semibold text-[var(--c-danger)]">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Composer un lien</CardTitle>
              <CardSubtitle>Actif immédiatement, journalisé côté serveur.</CardSubtitle>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <Field label="Nom" value={name} onChange={setName} placeholder="Acompte atelier · Novembre" maxLength={160} />
            <Field label="Description (optionnelle)" value={description} onChange={setDescription} placeholder="Ce que le client voit sur la page de paiement" maxLength={250} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Montant" value={amount} onChange={setAmount} suffix={symbol} placeholder={display === "XPF" ? "60 000" : "500,00"} inputMode="decimal" />
              <Select label="Usage" value={mode} onChange={(value) => setMode(value as "unique" | "recurring")} options={[{ value: "recurring", label: "Réutilisable" }, { value: "unique", label: "Usage unique" }]} />
            </div>
            {accounts.length > 1 ? (
              <Select label="Compte crédité" value={String(accountId ?? "")} onChange={(value) => setAccountId(Number(value))} options={accounts.filter((row) => row.status === "active").map((row) => ({ value: String(row.id), label: `${row.label} · ${row.currency}` }))} />
            ) : account ? <p className="text-[12px] text-[var(--c-t3)]">Crédité sur <b className="text-[var(--c-t2)]">{account.label}</b> ({account.currency}).</p> : null}
            <label className="block">
              <span className="legday-kicker mb-1 block text-[9px]">Expire le (optionnel)</span>
              <span className="block rounded-[14px] bg-[var(--c-s2)] px-3"><input type="date" value={expires} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setExpires(event.target.value)} className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" /></span>
            </label>
            <p className="text-[12px] leading-[1.5] text-[var(--c-t3)]">{mode === "unique" ? "Un lien à usage unique se ferme dès le premier paiement encaissé." : "Un lien réutilisable accepte autant de paiements que nécessaire, jusqu'à sa suspension ou son expiration."}</p>
            <div className="pt-2">
              <Button variant="primary" size="md" className="w-full" disabled={busy || !canCreate} onClick={() => void createLink()}>
                <Icon name="link" size={14} /> {busy ? "Création…" : "Générer le lien"}
              </Button>
            </div>
            {created ? (
              <div className="rounded-[20px] bg-[var(--tint-positive)] p-4" role="status">
                <p className="legday-kicker text-[9px]">Lien prêt à partager</p>
                <p className="legday-mono mt-2 break-all text-[12px] text-[var(--c-t1)]">{publicUrl(created.slug)}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => void copy(created.slug)}><Icon name="copy" size={14} /> {copied === created.slug ? "Copié" : "Copier"}</Button>
                  <a className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-bold text-[var(--c-signature)]" href={`/pay/${created.slug}`} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} /> Ouvrir</a>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {loading ? <p className="text-[13px] text-[var(--c-t3)]" role="status">Chargement…</p> : null}
          {!loading && links.length === 0 ? <div className="legday-empty">Aucun lien de paiement. Composez le premier à gauche.</div> : null}
          <ul className="space-y-3" aria-label="Liens de paiement">
            {links.map((link, index) => {
              const open = selected === link.id
              return (
                <li key={link.id} className="rounded-[20px] bg-[var(--c-s1)] p-4 shadow-[var(--shadow-card)]">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => setSelected(open ? null : link.id)} aria-expanded={open} className="legday-focus flex min-w-0 flex-1 items-center gap-3 rounded-[14px] text-left">
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[var(--c-bg)] shadow-[var(--shadow-socle)]" style={{ background: SOCLES[index % SOCLES.length] }} aria-hidden="true"><Icon name="link" size={20} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold text-[var(--c-t1)]">{link.name}</span>
                        <span className="legday-mono block truncate text-[11px] text-[var(--c-t3)]">/pay/{link.slug}</span>
                      </span>
                    </button>
                    <Badge tone={STATUS_TONE[link.status]}>{STATUS_LABEL[link.status]}</Badge>
                    <span className="legday-mono min-w-[88px] text-right text-[14px] font-bold text-[var(--c-t1)]">{money(link.amountCents, link.currency)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12px] text-[var(--c-t2)]">
                      {link.mode === "unique" ? "Usage unique" : "Réutilisable"} · {link.visits.toLocaleString("fr-FR")} visite{link.visits > 1 ? "s" : ""} · <b className={link.paid > 0 ? "text-[var(--c-positive)]" : "text-[var(--c-t3)]"}>{link.paid} payé{link.paid > 1 ? "s" : ""}</b> · {money(link.revenueCents, link.currency)}{link.targetAccount ? ` → ${link.targetAccount.label}` : ""}{link.expiresAt ? ` · expire le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(link.expiresAt))}` : ""}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void copy(link.slug)} aria-label="Copier l'adresse du lien"><Icon name="copy" size={14} /> {copied === link.slug ? "Copié" : "Copier"}</Button>
                      <a className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-bold text-[var(--c-t2)] hover:text-[var(--c-t1)]" href={`/pay/${link.slug}`} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir la page de paiement dans un nouvel onglet"><Icon name="external" size={14} /> Ouvrir</a>
                      {link.status === "active" ? <Button variant="ghost" size="sm" onClick={() => void setStatus(link, "disabled")}>Suspendre</Button> : null}
                      {link.status === "disabled" || link.status === "draft" ? <Button variant="ghost" size="sm" onClick={() => void setStatus(link, "active")}>Réactiver</Button> : null}
                    </div>
                  </div>
                  {open ? (
                    <div className="mt-4 rounded-[20px] bg-[var(--c-s2)] p-4">
                      <p className="legday-kicker text-[9px]">Derniers paiements · {selectedLink?.name}</p>
                      {payments === null ? <p className="mt-3 text-[13px] text-[var(--c-t3)]" role="status">Chargement…</p> : payments.length === 0 ? <p className="mt-3 text-[13px] text-[var(--c-t3)]">Aucun paiement pour l'instant. Partagez le lien pour recevoir le premier.</p> : (
                        <ul className="mt-3 space-y-2">
                          {payments.map((payment) => (
                            <li key={payment.reference} className="flex flex-wrap items-center gap-3 text-[13px]">
                              <span className="min-w-0 flex-1"><b className="block truncate text-[var(--c-t1)]">{payment.payerName ?? "Client"}</b><span className="legday-mono block text-[11px] text-[var(--c-t3)]">{payment.cardBrand ? `${payment.cardBrand} •••• ${payment.cardLast4 ?? "----"} · ` : ""}{when(payment.createdAt)}</span></span>
                              <Badge tone={PAYMENT_TONE[payment.status]}>{PAYMENT_LABEL[payment.status]}</Badge>
                              <span className="legday-mono font-bold text-[var(--c-t1)]">{money(payment.amountCents, payment.currency)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </>
  )
}

function Field({ label, value, onChange, suffix, placeholder, maxLength, inputMode }: { label: string; value: string; onChange: (value: string) => void; suffix?: string; placeholder?: string; maxLength?: number; inputMode?: "decimal" | "text" }) {
  const id = React.useId()
  return (
    <label className="block" htmlFor={id}>
      <span className="legday-kicker mb-1 block text-[9px]">{label}</span>
      <span className="flex items-center rounded-[14px] bg-[var(--c-s2)] px-3">
        <input id={id} type="text" inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" />
        {suffix ? <span className="legday-kicker ml-2 text-[10px] text-[var(--c-t3)]">{suffix}</span> : null}
      </span>
    </label>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  const id = React.useId()
  return (
    <label className="block" htmlFor={id}>
      <span className="legday-kicker mb-1 block text-[9px]">{label}</span>
      <span className="block rounded-[14px] bg-[var(--c-s2)] px-3">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="w-full appearance-none bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none">
          {options.map((option) => <option key={option.value} value={option.value} className="bg-[var(--c-s2)]">{option.label}</option>)}
        </select>
      </span>
    </label>
  )
}
