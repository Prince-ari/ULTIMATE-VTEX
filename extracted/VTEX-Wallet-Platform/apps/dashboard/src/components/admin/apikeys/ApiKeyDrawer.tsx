"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegDrawer, LegPill, LegReasonDialog, LegRow, LegSection, LegSocle } from "@/components/ui/legkit"
import { formatDate, formatDateTime } from "@/lib/adminFormat"
import { KEY_STATE_LABEL, KEY_STATE_TONE, MODE_LABEL, SCOPE_LABEL, daysUntil, isWriteScope, sinceLabel } from "@/lib/apiKeyFormat"
import { isAdmin, type PlatformRole } from "@/lib/roles"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
export type ApiKeyRow = Outputs["admin"]["apiKeys"]["list"][number]

/**
 * Fiche d'une clé d'API : préfixe (jamais le secret ni son empreinte), droits, dernière utilisation, rattachement à l'entreprise.
 * Révoquer une clé compromise exige un motif et entre au journal ; le titulaire en crée une nouvelle depuis Wallet Pro.
 */
export function ApiKeyDrawer({ keyRow, me, onClose, onChanged }: { keyRow: ApiKeyRow | null; me: { id: number; role: PlatformRole }; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const { show } = useToast()
  const [dialog, setDialog] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  // La dernière fiche ouverte reste affichée le temps que le tiroir se referme.
  const lastRef = React.useRef<ApiKeyRow | null>(null)
  if (keyRow) lastRef.current = keyRow
  const row = keyRow ?? lastRef.current
  const canManage = isAdmin(me.role)
  const left = row ? daysUntil(row.expiresAt) : null

  return (
    <>
      <LegDrawer
        open={keyRow !== null}
        onOpenChange={(open) => { if (!open) onClose() }}
        kicker="Fiche clé d'API"
        title={row?.label ?? "Clé d'API"}
        subtitle={row ? `${row.business.brandName} · ${MODE_LABEL[row.mode]}` : undefined}
        footer={row && canManage && row.state === "active" ? <LegButton variant="danger" icon="lock" onClick={() => setDialog(true)}>Révoquer la clé</LegButton> : undefined}
      >
        {row ? (
          <>
            <section className="pl-hero" aria-label="Clé d'API">
              <div className="pl-hero-top">
                <span className="lg-kicker">Préfixe visible</span>
                <LegPill tone={KEY_STATE_TONE[row.state]}>{KEY_STATE_LABEL[row.state]}</LegPill>
              </div>
              <p className="ak-prefix">{row.keyPrefix}<span aria-hidden="true">••••••••••••</span></p>
              <p className="pl-desc"><LegIcon name="lock" style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 6 }} />Le secret n'est jamais stocké : seule son empreinte l'est. Personne, pas même un administrateur, ne peut le relire.</p>
            </section>

            <div className="pl-stats" role="group" aria-label="Usage de la clé">
              <span><small>Droits</small><b>{row.scopes.length}</b></span>
              <span><small>Dernier appel</small><b>{sinceLabel(row.lastUsedAt)}</b></span>
              <span><small>Expiration</small><b>{row.expiresAt ? (left !== null && left > 0 ? `${left} j` : "Échue") : "Jamais"}</b></span>
            </div>

            {!canManage ? <p className="lg-notice"><LegIcon name="lock" />Lecture seule : révoquer une clé est réservé aux administrateurs.</p> : null}
            {row.state === "legacy" ? <p className="lg-notice"><LegIcon name="alert" />Clé antérieure à la version 1 de l'API : elle ne peut plus s'authentifier. Le titulaire doit en créer une nouvelle.</p> : null}

            <LegSection title="Droits accordés">
              {row.scopes.length === 0 ? <p className="lg-hint">Aucun droit reconnu : la clé ne peut rien faire.</p> : row.scopes.map((scope) => (
                <div key={scope} className="lg-account-head">
                  <LegSocle icon={isWriteScope(scope) ? "pencil" : "eye"} tone={isWriteScope(scope) ? "amber" : "teal"} size="sm" />
                  <span><strong>{SCOPE_LABEL[scope] ?? scope}</strong><small className="lg-mono">{scope}</small></span>
                  <LegPill tone={isWriteScope(scope) ? "warn" : "neutral"}>{isWriteScope(scope) ? "Écriture" : "Lecture"}</LegPill>
                </div>
              ))}
            </LegSection>

            <LegSection title="Rattachement et usage">
              <div className="lg-account-head">
                <LegSocle icon="building" tone="teal" size="md" />
                <span><strong>{row.business.brandName}</strong><small>Wallet Pro · entreprise #{row.business.id}</small></span>
              </div>
              <LegRow label="Environnement" value={MODE_LABEL[row.mode]} />
              <LegRow label="Créée par" value={row.createdBy} />
              <LegRow label="Créée le" value={formatDate(row.createdAt)} />
              <LegRow label="Dernière utilisation" value={row.lastUsedAt ? formatDateTime(row.lastUsedAt) : "Jamais"} />
              <LegRow label="Adresse de la dernière utilisation" value={row.lastUsedIp ? <span className="lg-mono">{row.lastUsedIp}</span> : "—"} />
              <LegRow label="Expire le" value={row.expiresAt ? formatDate(row.expiresAt) : "Jamais"} />
              {row.revokedAt ? <LegRow label="Révoquée le" value={formatDateTime(row.revokedAt)} /> : null}
              {row.rotatedFromId ? <LegRow label="Issue de la rotation de" value={`clé #${row.rotatedFromId}`} /> : null}
            </LegSection>
          </>
        ) : null}
      </LegDrawer>

      <LegReasonDialog
        open={dialog}
        onOpenChange={setDialog}
        title="Révoquer cette clé ?"
        description={row ? `Tout appel avec ${row.keyPrefix}… sera refusé immédiatement pour ${row.business.brandName}. Le titulaire devra créer une nouvelle clé. L'action est irréversible et journalisée.` : undefined}
        confirmLabel="Révoquer"
        destructive
        busy={busy}
        onConfirm={async (reason) => {
          if (!row) return
          setBusy(true)
          try {
            await api.admin.apiKeys.revoke.mutate({ id: row.id, reason })
            setDialog(false)
            show("Clé révoquée.")
            await onChanged()
          } catch (error) {
            show(error instanceof Error ? error.message : "Révocation impossible.", "error")
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
}
