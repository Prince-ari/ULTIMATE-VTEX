"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { PageHeader } from "@/components/shell/PageHeader"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card"
import { Icon } from "@/components/ui/Icon"
import { KpiTile } from "@/components/ui/KpiTile"
import { Modal } from "@/components/ui/Modal"
import { useBusinessContext } from "@/lib/business-context"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type Webhook = Outputs["developers"]["listWebhooks"][number]
type Delivery = Outputs["developers"]["listWebhookDeliveries"][number]

const STATE_LABEL: Record<Webhook["status"], string> = { active: "Actif", disabled: "Désactivé" }
const STATE_TONE: Record<Webhook["status"], BadgeTone> = { active: "positive", disabled: "neutral" }
const SOCLES = ["#5FA8D8", "#97CE5E", "#E5903F", "#BFE3A8"]

/** Catalogue des événements métier réellement modélisés (liens de paiement, factures, virements, recharges).
 *  La livraison n'étant pas encore active côté plateforme, ce choix ne fait que préparer l'endpoint. */
const EVENT_CATALOG = [
  { id: "payment_link.paid", label: "Lien de paiement payé" },
  { id: "payment_link.status_updated", label: "Lien de paiement — statut modifié" },
  { id: "invoice.paid", label: "Facture payée" },
  { id: "invoice.status_updated", label: "Facture — statut modifié" },
  { id: "payout.completed", label: "Virement sortant terminé" },
  { id: "topup.credited", label: "Recharge créditée" },
] as const

const errMsg = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)
const when = (value: Date | string | null) => (value ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : null)
const day = (value: Date | string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))

export default function WebhooksPage() {
  const { business, businessId } = useBusinessContext()
  const [hooks, setHooks] = React.useState<Webhook[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [url, setUrl] = React.useState("")
  const [events, setEvents] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState<null | "create" | number>(null)
  const [revealed, setRevealed] = React.useState<Set<number>>(new Set())
  const [inspecting, setInspecting] = React.useState<Webhook | null>(null)
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = React.useState(false)
  const canManage = business.myRole === "owner" || business.myRole === "admin"

  const urlValid = React.useMemo(() => {
    try { return new URL(url).protocol === "https:" || new URL(url).protocol === "http:" } catch { return false }
  }, [url])
  const canCreate = canManage && urlValid && events.size > 0

  const load = React.useCallback(async () => {
    setError(null)
    try {
      setHooks(await api.developers.listWebhooks.query({ businessId }))
    } catch (caught) {
      setError(errMsg(caught, "Impossible de charger les webhooks."))
    }
  }, [businessId])

  React.useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)) }, [load])

  function toggleEvent(id: string) {
    setEvents((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  async function create() {
    if (!canCreate || busy) return
    setBusy("create"); setError(null)
    try {
      setHooks(await api.developers.createWebhook.mutate({ businessId, url: url.trim(), events: [...events] }))
      setUrl(""); setEvents(new Set())
    } catch (caught) {
      setError(errMsg(caught, "Création impossible."))
    } finally {
      setBusy(null)
    }
  }

  async function toggle(hook: Webhook) {
    if (busy) return
    setBusy(hook.id); setError(null)
    try {
      setHooks(await api.developers.toggleWebhook.mutate({ businessId, webhookId: hook.id, status: hook.status === "active" ? "disabled" : "active" }))
    } catch (caught) {
      setError(errMsg(caught, "Modification impossible."))
    } finally {
      setBusy(null)
    }
  }

  function toggleReveal(id: number) {
    setRevealed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  async function inspect(hook: Webhook) {
    setInspecting(hook); setDeliveries([]); setDeliveriesLoading(true)
    try {
      setDeliveries(await api.developers.listWebhookDeliveries.query({ businessId, webhookId: hook.id }))
    } catch (caught) {
      setError(errMsg(caught, "Impossible de charger les livraisons."))
    } finally {
      setDeliveriesLoading(false)
    }
  }

  const active = hooks.filter((hook) => hook.status === "active")
  const distinctEvents = new Set(hooks.flatMap((hook) => hook.events)).size

  return (
    <>
      <PageHeader
        kicker="Développeurs"
        title="Webhooks"
        description="Une URL que la plateforme notifiera dès qu'un événement choisi se produit sur votre compte. Chaque endpoint a son propre secret, sert à signer les envois, et se désactive sans le supprimer."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile kicker="Endpoints actifs" value={String(active.length)} hint={`${hooks.length} au total`} tone="signature" />
        <KpiTile kicker="Événements suivis" value={String(distinctEvents)} hint="types distincts" />
        <KpiTile kicker="Désactivés" value={String(hooks.length - active.length)} hint="conservés, réactivables" />
        <KpiTile kicker="Rôle requis" value={canManage ? "Vous gérez" : "Lecture seule"} hint="owner ou admin" tone={canManage ? "positive" : undefined} />
      </section>

      <p className="mb-6 flex items-start gap-3 rounded-[20px] bg-[var(--tint-gold)] px-4 py-3 text-[13px] leading-[1.5] text-[var(--c-t1)]" role="note">
        <span className="mt-[1px] flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--c-gold)] text-[#0a0d1e]" aria-hidden="true"><Icon name="hook" size={14} /></span>
        <span><b>Livraison pas encore active.</b> Les endpoints créés ici sont enregistrés et prêts, mais la plateforme n'envoie aucun événement pour l'instant — l'historique des livraisons restera vide tant que ce n'est pas mis en service.</span>
      </p>

      {error ? <p role="alert" className="mb-6 rounded-[14px] bg-[var(--tint-danger)] px-4 py-3 text-[13px] font-semibold text-[var(--c-danger)]">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Ajouter un endpoint</CardTitle>
                <CardSubtitle>Choisissez les événements qui vous concernent.</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {!canManage ? <p className="text-[13px] text-[var(--c-t2)]">La gestion des webhooks est réservée aux propriétaires et aux administrateurs de l'entreprise.</p> : null}
              <label className="block">
                <span className="legday-kicker mb-1 block text-[9px]">URL de l'endpoint</span>
                <span className="block rounded-[14px] bg-[var(--c-s2)] px-3"><input value={url} onChange={(event) => setUrl(event.target.value)} maxLength={300} placeholder="https://votre-serveur.example.com/webhooks/vtex" disabled={!canManage} className="legday-mono w-full bg-transparent py-2 text-[12px] text-[var(--c-t1)] outline-none" /></span>
                {url.length > 0 && !urlValid ? <p className="mt-2 text-[12px] leading-[1.5] text-[var(--c-danger)]">URL invalide (doit commencer par https:// ou http://).</p> : null}
              </label>
              <fieldset>
                <legend className="legday-kicker mb-2 text-[9px]">Événements</legend>
                <div className="space-y-2">
                  {EVENT_CATALOG.map((event) => {
                    const on = events.has(event.id)
                    return (
                      <button key={event.id} type="button" role="checkbox" aria-checked={on} disabled={!canManage} onClick={() => toggleEvent(event.id)} className={`legday-focus flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left transition ${on ? "bg-[var(--tint-primary)]" : "bg-[var(--c-s2)] hover:bg-white/[.08]"}`}>
                        <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${on ? "bg-[var(--c-signature)] text-[#0a0d1e] shadow-[var(--shadow-socle)]" : "bg-white/[.08] text-transparent"}`} aria-hidden="true"><Icon name="check" size={14} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold text-[var(--c-t1)]">{event.label}</span>
                          <span className="legday-mono block truncate text-[11px] text-[var(--c-t3)]">{event.id}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              <Button variant="primary" size="md" className="w-full" disabled={!canCreate || busy !== null} onClick={() => void create()}>
                <Icon name="hook" size={14} /> {busy === "create" ? "Ajout…" : "Ajouter l'endpoint"}
              </Button>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-3 lg:col-span-2">
          {loading ? <p className="text-[13px] text-[var(--c-t3)]" role="status">Chargement…</p> : null}
          {!loading && hooks.length === 0 && !error ? <div className="legday-empty">Aucun endpoint pour l'instant. Ajoutez le premier à gauche.</div> : null}
          <ul className="space-y-3" aria-label="Webhooks">
            {hooks.map((hook, index) => {
              const inactive = hook.status !== "active"
              const isRevealed = revealed.has(hook.id)
              return (
                <li key={hook.id} className={`rounded-[20px] bg-[var(--c-s1)] p-4 shadow-[var(--shadow-card)] ${inactive ? "opacity-70" : ""}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[var(--c-bg)] shadow-[var(--shadow-socle)]" style={{ background: SOCLES[index % SOCLES.length] }} aria-hidden="true"><Icon name="hook" size={20} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="legday-mono block truncate text-[13px] font-bold text-[var(--c-t1)]">{hook.url}</span>
                      <span className="block text-[11px] text-[var(--c-t3)]">créé le {day(hook.createdAt)}{hook.lastDeliveryAt ? ` · dernière livraison ${when(hook.lastDeliveryAt)}` : " · aucune livraison"}</span>
                    </span>
                    <Badge tone={STATE_TONE[hook.status]}>{STATE_LABEL[hook.status]}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hook.events.map((event) => <span key={event} className="legday-mono rounded-full bg-white/[.06] px-3 py-1 text-[11px] text-[var(--c-t2)]">{event}</span>)}
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-[var(--c-s2)] px-3 py-2">
                    <span className="legday-kicker text-[9px]">Secret</span>
                    <code className="legday-mono flex-1 truncate text-[12px] text-[var(--c-t1)]">{isRevealed ? hook.secret : "•".repeat(24)}</code>
                    <button type="button" onClick={() => toggleReveal(hook.id)} className="legday-focus text-[11px] font-bold text-[var(--c-signature)]">{isRevealed ? "Masquer" : "Afficher"}</button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <Button variant="ghost" size="sm" onClick={() => void inspect(hook)}><Icon name="list" size={14} /> Livraisons</Button>
                    {canManage ? (
                      <Button variant={hook.status === "active" ? "ghost" : "secondary"} size="sm" disabled={busy === hook.id} onClick={() => void toggle(hook)}>
                        {hook.status === "active" ? <><Icon name="close" size={14} /> Désactiver</> : <><Icon name="check" size={14} /> Réactiver</>}
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <Modal
        open={inspecting !== null}
        onClose={() => setInspecting(null)}
        title="Historique des livraisons"
        description={inspecting ? <span className="legday-mono">{inspecting.url}</span> : undefined}
        footer={<Button variant="secondary" size="md" onClick={() => setInspecting(null)}>Fermer</Button>}
      >
        {deliveriesLoading ? <p className="text-[13px] text-[var(--c-t3)]" role="status">Chargement…</p> : null}
        {!deliveriesLoading && deliveries.length === 0 ? (
          <div className="legday-empty">Aucune livraison enregistrée — la livraison n'est pas encore active sur cette plateforme.</div>
        ) : null}
        <ul className="space-y-2">
          {deliveries.map((delivery) => (
            <li key={delivery.id} className="rounded-[14px] bg-[var(--c-s1)] px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="legday-mono text-[12px] text-[var(--c-t1)]">{delivery.event}</span>
                <Badge tone={delivery.success ? "positive" : "danger"}>{delivery.success ? "Livré" : "Échec"}{delivery.statusCode ? ` · ${delivery.statusCode}` : ""}</Badge>
              </div>
              <p className="mt-1 text-[11px] text-[var(--c-t3)]">{when(delivery.createdAt)}</p>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
