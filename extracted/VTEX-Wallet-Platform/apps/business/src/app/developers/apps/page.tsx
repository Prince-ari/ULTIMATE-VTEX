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
type App = Outputs["developers"]["listApplications"][number]

const STATE_LABEL: Record<App["status"], string> = { active: "Active", disabled: "Révoquée" }
const STATE_TONE: Record<App["status"], BadgeTone> = { active: "positive", disabled: "danger" }
/** Un socle plein par famille de teinte, en cycle d'une ligne à l'autre (le maelström chromatique, RULE 008). */
const SOCLES = ["#5FA8D8", "#97CE5E", "#E5903F", "#BFE3A8"]

const errMsg = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)
const day = (value: Date | string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))

function parseUris(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function isValidUri(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

export default function ApplicationsPage() {
  const { business, businessId } = useBusinessContext()
  const [apps, setApps] = React.useState<App[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [uris, setUris] = React.useState("")
  const [busy, setBusy] = React.useState<null | "create" | "revoke">(null)
  const [created, setCreated] = React.useState<{ clientId: string; clientSecret: string; name: string } | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [manualCopy, setManualCopy] = React.useState(false)
  const [revoking, setRevoking] = React.useState<App | null>(null)
  const canManage = business.myRole === "owner" || business.myRole === "admin"

  const uriList = React.useMemo(() => parseUris(uris), [uris])
  const invalidUri = uriList.find((uri) => !isValidUri(uri))
  const canCreate = canManage && name.trim().length >= 2 && uriList.length > 0 && !invalidUri

  const load = React.useCallback(async () => {
    setError(null)
    try {
      setApps(await api.developers.listApplications.query({ businessId }))
    } catch (caught) {
      setError(errMsg(caught, "Impossible de charger les applications."))
    }
  }, [businessId])

  React.useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)) }, [load])

  async function create() {
    if (!canCreate || busy) return
    setBusy("create"); setError(null)
    try {
      const result = await api.developers.createApplication.mutate({ businessId, name: name.trim(), redirectUris: uriList })
      setApps(result.applications)
      setCreated({ clientId: result.clientId, clientSecret: result.clientSecret, name: name.trim() })
      setCopied(false); setManualCopy(false)
      setName(""); setUris("")
    } catch (caught) {
      setError(errMsg(caught, "Création impossible."))
    } finally {
      setBusy(null)
    }
  }

  async function revoke() {
    if (!revoking || busy) return
    setBusy("revoke"); setError(null)
    try {
      setApps(await api.developers.revokeApplication.mutate({ businessId, applicationId: revoking.id }))
      setRevoking(null)
    } catch (caught) {
      setError(errMsg(caught, "Révocation impossible.")); setRevoking(null)
    } finally {
      setBusy(null)
    }
  }

  async function copySecret() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.clientSecret)
      setCopied(true)
    } catch {
      setManualCopy(true)
    }
  }

  const active = apps.filter((app) => app.status === "active")
  const revoked = apps.filter((app) => app.status === "disabled").length
  const totalUris = active.reduce((sum, app) => sum + app.redirectUris.length, 0)

  return (
    <>
      <PageHeader
        kicker="Développeurs"
        title="Applications"
        description="Les applications tierces qui accèdent à votre compte via un identifiant et un secret client. Chacune a ses propres URIs de redirection et se révoque en un clic, sans toucher aux autres."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile kicker="Applications actives" value={String(active.length)} hint={`${apps.length} au total`} tone="signature" />
        <KpiTile kicker="URIs de redirection" value={String(totalUris)} hint="enregistrées, apps actives" />
        <KpiTile kicker="Révoquées" value={String(revoked)} hint="conservées dans l'historique" />
        <KpiTile kicker="Rôle requis" value={canManage ? "Vous gérez" : "Lecture seule"} hint="owner ou admin" tone={canManage ? "positive" : undefined} />
      </section>

      {error ? <p role="alert" className="mb-6 rounded-[14px] bg-[var(--tint-danger)] px-4 py-3 text-[13px] font-semibold text-[var(--c-danger)]">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Créer une application</CardTitle>
                <CardSubtitle>Le secret client n'est affiché qu'une seule fois.</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {!canManage ? <p className="text-[13px] text-[var(--c-t2)]">La gestion des applications est réservée aux propriétaires et aux administrateurs de l'entreprise.</p> : null}
              <label className="block">
                <span className="legday-kicker mb-1 block text-[9px]">Nom de l'application</span>
                <span className="block rounded-[14px] bg-[var(--c-s2)] px-3"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Caisse boutique" disabled={!canManage} className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" /></span>
              </label>
              <label className="block">
                <span className="legday-kicker mb-1 block text-[9px]">URIs de redirection (une par ligne)</span>
                <span className="block rounded-[14px] bg-[var(--c-s2)] px-3 py-2">
                  <textarea value={uris} onChange={(event) => setUris(event.target.value)} disabled={!canManage} rows={3} placeholder={"https://boutique.example.com/callback"} className="legday-mono w-full resize-none bg-transparent text-[12px] leading-[1.6] text-[var(--c-t1)] outline-none placeholder:text-[var(--c-t3)]" />
                </span>
                {invalidUri ? <p className="mt-2 text-[12px] leading-[1.5] text-[var(--c-danger)]">URI invalide : {invalidUri} (doit commencer par https:// ou http://)</p> : null}
              </label>
              <Button variant="primary" size="md" className="w-full" disabled={!canCreate || busy !== null} onClick={() => void create()}>
                <Icon name="apps" size={14} /> {busy === "create" ? "Création…" : "Créer l'application"}
              </Button>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-3 lg:col-span-2">
          {loading ? <p className="text-[13px] text-[var(--c-t3)]" role="status">Chargement…</p> : null}
          {!loading && apps.length === 0 && !error ? <div className="legday-empty">Aucune application pour l'instant. Créez la première à gauche.</div> : null}
          <ul className="space-y-3" aria-label="Applications">
            {apps.map((app, index) => {
              const inactive = app.status !== "active"
              return (
                <li key={app.id} className={`rounded-[20px] bg-[var(--c-s1)] p-4 shadow-[var(--shadow-card)] ${inactive ? "opacity-70" : ""}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[var(--c-bg)] shadow-[var(--shadow-socle)]" style={{ background: SOCLES[index % SOCLES.length] }} aria-hidden="true"><Icon name="apps" size={20} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-[var(--c-t1)]">{app.name}</span>
                      <span className="legday-mono block text-[11px] text-[var(--c-t3)]">{app.clientId}</span>
                    </span>
                    <Badge tone={STATE_TONE[app.status]}>{STATE_LABEL[app.status]}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {app.redirectUris.map((uri) => <span key={uri} className="legday-mono truncate rounded-full bg-white/[.06] px-3 py-1 text-[11px] text-[var(--c-t2)]" style={{ maxWidth: 260 }}>{uri}</span>)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12px] leading-[1.6] text-[var(--c-t2)]">créée le {day(app.createdAt)}</p>
                    {canManage && app.status === "active" ? (
                      <Button variant="ghost" size="sm" onClick={() => setRevoking(app)}><Icon name="close" size={14} /> Révoquer</Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <Modal
        open={created !== null}
        onClose={() => undefined}
        dismissible={false}
        title="Copiez le secret client maintenant"
        description={`L'application « ${created?.name ?? ""} » est créée. Pour sa sécurité, le secret ne sera plus jamais affiché : conservez-le dans un gestionnaire de secrets.`}
        footer={<Button variant="primary" size="md" data-autofocus disabled={!copied && !manualCopy} onClick={() => { setCreated(null); setManualCopy(false) }}>{copied || manualCopy ? "J'ai copié le secret" : "Copiez d'abord le secret"}</Button>}
      >
        <div className="space-y-3">
          <div className="rounded-[20px] bg-[var(--c-s1)] p-4">
            <p className="legday-kicker text-[9px]">Client ID</p>
            <code className="legday-mono mt-2 block break-all text-[13px] leading-[1.6] text-[var(--c-t1)] select-all">{created?.clientId}</code>
          </div>
          <div className="rounded-[20px] bg-[var(--c-s1)] p-4">
            <p className="legday-kicker text-[9px]">Client secret</p>
            <code className="legday-mono mt-2 block break-all text-[13px] leading-[1.6] text-[var(--c-t1)] select-all" data-testid="app-secret">{created?.clientSecret}</code>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void copySecret()}><Icon name="copy" size={14} /> {copied ? "Copié" : "Copier le secret"}</Button>
            {manualCopy ? <p className="mt-3 text-[12px] leading-[1.5] text-[var(--c-gold)]" role="status">Votre navigateur bloque le presse-papiers : sélectionnez le secret ci-dessus (un clic le sélectionne) et copiez-le à la main.</p> : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        tone="danger"
        title="Révoquer cette application ?"
        description={revoking ? `L'application « ${revoking.name} » ne pourra plus s'authentifier. Cette action est irréversible et journalisée.` : undefined}
        footer={<><Button variant="ghost" size="md" onClick={() => setRevoking(null)} disabled={busy === "revoke"}>Annuler</Button><Button variant="danger" size="md" disabled={busy === "revoke"} onClick={() => void revoke()}>{busy === "revoke" ? "Révocation…" : "Révoquer l'application"}</Button></>}
      />
    </>
  )
}
