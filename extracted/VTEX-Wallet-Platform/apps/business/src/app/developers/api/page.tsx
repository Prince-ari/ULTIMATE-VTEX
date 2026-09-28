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
type Key = Outputs["developers"]["listApiKeys"][number]
type ScopeInfo = Outputs["developers"]["apiScopes"][number]

const STATE_LABEL: Record<Key["state"], string> = { active: "Active", expired: "Expirée", revoked: "Révoquée", legacy: "À recréer" }
const STATE_TONE: Record<Key["state"], BadgeTone> = { active: "positive", expired: "neutral", revoked: "danger", legacy: "gold" }
/** Un socle plein par famille de teinte, en cycle d'une ligne à l'autre (le maelström chromatique, RULE 008). */
const SOCLES = ["#5FA8D8", "#97CE5E", "#E5903F", "#BFE3A8"]
const EXPIRIES: Array<{ value: string; label: string; days: number | null }> = [
  { value: "never", label: "Jamais", days: null },
  { value: "30", label: "Dans 30 jours", days: 30 },
  { value: "90", label: "Dans 90 jours", days: 90 },
  { value: "365", label: "Dans 1 an", days: 365 },
]
const GRACES = [
  { value: 0, label: "Aucune : l'ancienne clé est révoquée tout de suite" },
  { value: 1, label: "1 heure" },
  { value: 24, label: "24 heures" },
  { value: 72, label: "72 heures" },
]
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.votre-domaine.com").replace(/\/+$/, "")

const errMsg = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)
const when = (value: Date | string | null) => (value ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : null)
const day = (value: Date | string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))

export default function ApiKeysPage() {
  const { business, businessId } = useBusinessContext()
  const [keys, setKeys] = React.useState<Key[]>([])
  const [scopes, setScopes] = React.useState<ScopeInfo[]>([])
  const [environment, setEnvironment] = React.useState<"live" | "sandbox">("sandbox")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [label, setLabel] = React.useState("")
  const [mode, setMode] = React.useState<"live" | "sandbox">("sandbox")
  const [picked, setPicked] = React.useState<Set<string>>(new Set(["wallet:read"]))
  const [expiry, setExpiry] = React.useState("never")
  const [busy, setBusy] = React.useState<null | "create" | "rotate" | "revoke">(null)
  const [secret, setSecret] = React.useState<{ rawKey: string; label: string; rotated: boolean } | null>(null)
  const [copied, setCopied] = React.useState(false)
  // Si le presse-papiers est bloqué, on n'enferme pas l'utilisateur : il copie à la main (le secret est sélectionnable) puis confirme.
  const [manualCopy, setManualCopy] = React.useState(false)
  const [rotating, setRotating] = React.useState<Key | null>(null)
  const [grace, setGrace] = React.useState(24)
  const [revoking, setRevoking] = React.useState<Key | null>(null)
  const [reason, setReason] = React.useState("")
  const canManage = business.myRole === "owner" || business.myRole === "admin"

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const [rows, catalogue, env] = await Promise.all([api.developers.listApiKeys.query({ businessId }), api.developers.apiScopes.query(), api.developers.environment.query()])
      setKeys(rows); setScopes(catalogue)
      setEnvironment(env.environment); setMode(env.environment)
    } catch (caught) {
      setError(errMsg(caught, "Impossible de charger les clés d'API."))
    }
  }, [businessId])

  React.useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)) }, [load])

  function toggleScope(id: string) {
    setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  async function create() {
    if (busy || label.trim().length < 2 || picked.size === 0) return
    setBusy("create"); setError(null)
    try {
      const days = EXPIRIES.find((item) => item.value === expiry)?.days ?? null
      const result = await api.developers.createApiKey.mutate({
        businessId, label: label.trim(), mode, scopes: [...picked] as Array<ScopeInfo["id"]>,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000) : undefined,
      })
      setKeys(result.keys); setSecret({ rawKey: result.rawKey, label: label.trim(), rotated: false }); setCopied(false)
      setLabel("")
    } catch (caught) {
      setError(errMsg(caught, "Création impossible."))
    } finally {
      setBusy(null)
    }
  }

  async function rotate() {
    if (!rotating || busy) return
    setBusy("rotate"); setError(null)
    try {
      const result = await api.developers.rotateApiKey.mutate({ businessId, keyId: rotating.id, graceHours: grace })
      setKeys(result.keys); setSecret({ rawKey: result.rawKey, label: rotating.label, rotated: true }); setCopied(false)
      setRotating(null)
    } catch (caught) {
      setError(errMsg(caught, "Renouvellement impossible.")); setRotating(null)
    } finally {
      setBusy(null)
    }
  }

  async function revoke() {
    if (!revoking || busy) return
    setBusy("revoke"); setError(null)
    try {
      setKeys(await api.developers.revokeApiKey.mutate({ businessId, keyId: revoking.id, reason: reason.trim() || undefined }))
      setRevoking(null); setReason("")
    } catch (caught) {
      setError(errMsg(caught, "Révocation impossible.")); setRevoking(null)
    } finally {
      setBusy(null)
    }
  }

  async function copySecret() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret.rawKey)
      setCopied(true)
    } catch {
      setManualCopy(true)
    }
  }

  const active = keys.filter((key) => key.state === "active")
  const usedToday = keys.filter((key) => key.lastUsedAt && Date.now() - new Date(key.lastUsedAt).getTime() < 86_400_000).length
  const expiringSoon = active.filter((key) => key.expiresAt && new Date(key.expiresAt).getTime() - Date.now() < 14 * 86_400_000).length
  const revoked = keys.filter((key) => key.state === "revoked").length
  const writeScopes = scopes.filter((scope) => picked.has(scope.id) && scope.access === "write").length

  return (
    <>
      <PageHeader
        kicker="Développeurs"
        title="Clés d'API"
        description="Donnez à vos serveurs un accès précis à votre compte : lire les soldes et les transactions, créer des liens de paiement. Chaque clé n'a que les droits que vous cochez, s'arrête à la date choisie et se révoque en un clic."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile kicker="Clés actives" value={String(active.length)} hint={`${keys.length} au total`} tone="signature" />
        <KpiTile kicker="Utilisées (24 h)" value={String(usedToday)} hint="au moins un appel" />
        <KpiTile kicker="À renouveler" value={String(expiringSoon)} hint="expirent sous 14 jours" tone={expiringSoon > 0 ? "warm" : undefined} />
        <KpiTile kicker="Révoquées" value={String(revoked)} hint="conservées dans l'historique" />
      </section>

      <p className={`mb-6 flex items-start gap-3 rounded-[20px] px-4 py-3 text-[13px] leading-[1.5] ${environment === "live" ? "bg-[var(--tint-warm)] text-[var(--c-t1)]" : "bg-[var(--tint-primary)] text-[var(--c-t1)]"}`} role="note">
        <span className="mt-[1px] flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--c-signature)] text-[#0a0d1e]" aria-hidden="true"><Icon name="shield" size={14} /></span>
        <span>{environment === "live"
          ? <><b>Environnement de production.</b> Seules les clés de production (<span className="legday-mono">vtx_live_</span>) sont acceptées : elles agissent sur de l'argent réel.</>
          : <><b>Environnement de test.</b> Seules les clés de test (<span className="legday-mono">vtx_test_</span>) sont acceptées : aucun paiement réel n'est encaissé. Les clés de production fonctionneront quand la plateforme passera en mode réel.</>}</span>
      </p>

      {error ? <p role="alert" className="mb-6 rounded-[14px] bg-[var(--tint-danger)] px-4 py-3 text-[13px] font-semibold text-[var(--c-danger)]">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Créer une clé</CardTitle>
                <CardSubtitle>Le secret n'est affiché qu'une seule fois.</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {!canManage ? <p className="text-[13px] text-[var(--c-t2)]">La gestion des clés est réservée aux propriétaires et aux administrateurs de l'entreprise.</p> : null}
              <label className="block">
                <span className="legday-kicker mb-1 block text-[9px]">Nom de la clé</span>
                <span className="block rounded-[14px] bg-[var(--c-s2)] px-3"><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={100} placeholder="Serveur de la boutique" disabled={!canManage} className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" /></span>
              </label>
              <fieldset>
                <legend className="legday-kicker mb-1 text-[9px]">Environnement</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Environnement de la clé">
                  {([["sandbox", "Test"], ["live", "Production"]] as const).map(([value, text]) => (
                    <button key={value} type="button" role="radio" aria-checked={mode === value} disabled={!canManage} onClick={() => setMode(value)} className={`legday-focus whitespace-nowrap rounded-full px-4 py-2 text-[12px] font-bold transition ${mode === value ? "bg-[var(--c-signature)] text-[#0a0d1e]" : "bg-white/[.06] text-[var(--c-t2)] hover:bg-white/[.10]"}`}>{text}{value === environment ? " · actif" : ""}</button>
                  ))}
                </div>
                {mode !== environment ? <p className="mt-2 text-[12px] leading-[1.5] text-[var(--c-gold)]">Cette clé ne fonctionnera pas tant que la plateforme est en mode {environment === "live" ? "production" : "test"}.</p> : null}
              </fieldset>
              <fieldset>
                <legend className="legday-kicker mb-2 text-[9px]">Droits</legend>
                <div className="space-y-2">
                  {scopes.map((scope) => {
                    const on = picked.has(scope.id)
                    return (
                      <button key={scope.id} type="button" role="checkbox" aria-checked={on} disabled={!canManage} onClick={() => toggleScope(scope.id)} className={`legday-focus flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left transition ${on ? "bg-[var(--tint-primary)]" : "bg-[var(--c-s2)] hover:bg-white/[.08]"}`}>
                        <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${on ? "bg-[var(--c-signature)] text-[#0a0d1e] shadow-[var(--shadow-socle)]" : "bg-white/[.08] text-transparent"}`} aria-hidden="true"><Icon name="check" size={14} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold text-[var(--c-t1)]">{scope.label}</span>
                          <span className="legday-mono block truncate text-[11px] text-[var(--c-t3)]">{scope.id} · {scope.description}</span>
                        </span>
                        <Badge tone={scope.access === "write" ? "warm" : "neutral"}>{scope.access === "write" ? "Écriture" : "Lecture"}</Badge>
                      </button>
                    )
                  })}
                </div>
                {writeScopes > 0 ? <p className="mt-2 text-[12px] leading-[1.5] text-[var(--c-gold)]">Un droit d'écriture permet à quiconque détient la clé d'agir en votre nom. Ne la placez jamais dans une application mobile ou une page web.</p> : null}
              </fieldset>
              <label className="block">
                <span className="legday-kicker mb-1 block text-[9px]">Expiration</span>
                <span className="block rounded-[14px] bg-[var(--c-s2)] px-3">
                  <select value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={!canManage} className="w-full appearance-none bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none">
                    {EXPIRIES.map((item) => <option key={item.value} value={item.value} className="bg-[var(--c-s2)]">{item.label}</option>)}
                  </select>
                </span>
              </label>
              <Button variant="primary" size="md" className="w-full" disabled={!canManage || busy !== null || label.trim().length < 2 || picked.size === 0} onClick={() => void create()}>
                <Icon name="key" size={14} /> {busy === "create" ? "Création…" : "Créer la clé"}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Prise en main</CardTitle>
                <CardSubtitle>Un appel suffit pour vérifier votre clé.</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              <pre className="legday-mono overflow-x-auto rounded-[14px] bg-[var(--c-s2)] p-3 text-[11.5px] leading-[1.6] text-[var(--c-t1)]">{`curl ${API_BASE}/api/v1/wallet \\\n  -H "Authorization: Bearer vtx_test_…"`}</pre>
              <ul className="space-y-1 text-[12px] leading-[1.5] text-[var(--c-t2)]">
                <li><span className="legday-mono text-[var(--c-t1)]">GET /api/v1/me</span> — la clé et ses droits</li>
                <li><span className="legday-mono text-[var(--c-t1)]">GET /api/v1/wallet</span> — comptes et soldes</li>
                <li><span className="legday-mono text-[var(--c-t1)]">GET /api/v1/transactions</span> — pagination par curseur</li>
                <li><span className="legday-mono text-[var(--c-t1)]">GET·POST /api/v1/payment_links</span> — en-tête <span className="legday-mono">Idempotency-Key</span> conseillé</li>
              </ul>
              <p className="text-[12px] leading-[1.5] text-[var(--c-t3)]">Montants en unités mineures (centimes), dates ISO 8601. 300 requêtes par minute et par clé.</p>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-3 lg:col-span-2">
          {loading ? <p className="text-[13px] text-[var(--c-t3)]" role="status">Chargement…</p> : null}
          {!loading && keys.length === 0 && !error ? <div className="legday-empty">Aucune clé pour l'instant. Créez la première à gauche.</div> : null}
          <ul className="space-y-3" aria-label="Clés d'API">
            {keys.map((key, index) => {
              const inactive = key.state !== "active"
              return (
                <li key={key.id} className={`rounded-[20px] bg-[var(--c-s1)] p-4 shadow-[var(--shadow-card)] ${inactive ? "opacity-70" : ""}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[var(--c-bg)] shadow-[var(--shadow-socle)]" style={{ background: SOCLES[index % SOCLES.length] }} aria-hidden="true"><Icon name="key" size={20} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-[var(--c-t1)]">{key.label}</span>
                      <span className="legday-mono block text-[11px] text-[var(--c-t3)]">{key.keyPrefix}…</span>
                    </span>
                    <Badge tone={key.mode === "live" ? "warm" : "neutral"}>{key.mode === "live" ? "Production" : "Test"}</Badge>
                    <Badge tone={STATE_TONE[key.state]}>{STATE_LABEL[key.state]}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {key.scopes.map((scope) => <span key={scope} className="legday-mono rounded-full bg-white/[.06] px-3 py-1 text-[11px] text-[var(--c-t2)]">{scope}</span>)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12px] leading-[1.6] text-[var(--c-t2)]">
                      {key.lastUsedAt ? <>Dernière utilisation {when(key.lastUsedAt)}{key.lastUsedIp ? <> depuis <span className="legday-mono">{key.lastUsedIp}</span></> : null}</> : "Jamais utilisée"}
                      {" · "}créée le {day(key.createdAt)}
                      {key.expiresAt ? <> · {key.state === "expired" ? "a expiré" : "expire"} le {day(key.expiresAt)}</> : null}
                      {key.revokedAt ? <> · révoquée le {day(key.revokedAt)}</> : null}
                      {key.rotatedFromId ? " · issue d'une rotation" : null}
                    </p>
                    {canManage && key.state === "active" ? (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setGrace(24); setRotating(key) }}><Icon name="cycle" size={14} /> Renouveler</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setReason(""); setRevoking(key) }}><Icon name="close" size={14} /> Révoquer</Button>
                      </div>
                    ) : null}
                  </div>
                  {key.state === "legacy" ? <p className="mt-3 rounded-[14px] bg-[var(--tint-gold)] px-3 py-2 text-[12px] leading-[1.5] text-[var(--c-t1)]">Cette clé date d'avant la version 1 de l'API et ne peut plus s'authentifier. Créez-en une nouvelle.</p> : null}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <Modal
        open={secret !== null}
        onClose={() => undefined}
        dismissible={false}
        title={secret?.rotated ? "Nouvelle clé prête" : "Copiez votre clé maintenant"}
        description={secret?.rotated ? `La clé « ${secret.label} » a été renouvelée. Déployez la nouvelle clé avant la fin de la période de grâce.` : `La clé « ${secret?.label ?? ""} » est créée. Pour votre sécurité, elle ne sera plus jamais affichée : conservez-la dans un gestionnaire de secrets.`}
        footer={<Button variant="primary" size="md" data-autofocus disabled={!copied && !manualCopy} onClick={() => { setSecret(null); setManualCopy(false) }}>{copied || manualCopy ? "J'ai copié la clé" : "Copiez d'abord la clé"}</Button>}
      >
        <div className="rounded-[20px] bg-[var(--c-s1)] p-4">
          <p className="legday-kicker text-[9px]">Clé secrète</p>
          <code className="legday-mono mt-2 block break-all text-[13px] leading-[1.6] text-[var(--c-t1)] select-all" data-testid="api-secret">{secret?.rawKey}</code>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void copySecret()}><Icon name="copy" size={14} /> {copied ? "Copiée" : "Copier la clé"}</Button>
          {manualCopy ? <p className="mt-3 text-[12px] leading-[1.5] text-[var(--c-gold)]" role="status">Votre navigateur bloque le presse-papiers : sélectionnez la clé ci-dessus (un clic la sélectionne) et copiez-la à la main.</p> : null}
        </div>
      </Modal>

      <Modal
        open={rotating !== null}
        onClose={() => setRotating(null)}
        title="Renouveler cette clé ?"
        description={rotating ? `Une nouvelle clé « ${rotating.label} » est créée avec les mêmes droits. L'ancienne (${rotating.keyPrefix}…) reste valable pendant la période de grâce, le temps de déployer la nouvelle.` : undefined}
        footer={<><Button variant="ghost" size="md" onClick={() => setRotating(null)} disabled={busy === "rotate"}>Annuler</Button><Button variant="primary" size="md" disabled={busy === "rotate"} onClick={() => void rotate()}>{busy === "rotate" ? "Renouvellement…" : "Renouveler"}</Button></>}
      >
        <label className="block">
          <span className="legday-kicker mb-1 block text-[9px]">Période de grâce de l'ancienne clé</span>
          <span className="block rounded-[14px] bg-[var(--c-s1)] px-3">
            <select value={grace} onChange={(event) => setGrace(Number(event.target.value))} className="w-full appearance-none bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none">
              {GRACES.map((item) => <option key={item.value} value={item.value} className="bg-[var(--c-s2)]">{item.label}</option>)}
            </select>
          </span>
        </label>
      </Modal>

      <Modal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        tone="danger"
        title="Révoquer cette clé ?"
        description={revoking ? `Tout appel avec la clé « ${revoking.label} » (${revoking.keyPrefix}…) sera refusé immédiatement. Cette action est irréversible et journalisée.` : undefined}
        footer={<><Button variant="ghost" size="md" onClick={() => setRevoking(null)} disabled={busy === "revoke"}>Annuler</Button><Button variant="danger" size="md" disabled={busy === "revoke"} onClick={() => void revoke()}>{busy === "revoke" ? "Révocation…" : "Révoquer la clé"}</Button></>}
      >
        <label className="block">
          <span className="legday-kicker mb-1 block text-[9px]">Motif (optionnel)</span>
          <span className="block rounded-[14px] bg-[var(--c-s1)] px-3"><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={250} placeholder="Clé exposée, service arrêté…" className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" /></span>
        </label>
      </Modal>
    </>
  )
}
