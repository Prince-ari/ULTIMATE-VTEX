"use client"

import * as Dialog from "@radix-ui/react-dialog"
import * as React from "react"

import { LegIcon, type LegIconName } from "@/components/ui/LegIcon"
import { cx } from "@/lib/utils"

/**
 * Kit Leg Day du Dashboard — les briques des écrans d'administration (tiroir, dialogue, bouton pilule, socle, pastille).
 * Les styles vivent dans `app/legday.css` (classes `lg-*`) : aucune couleur ni ombre n'est décidée ici, tout vient des tokens Leg Day.
 * Aucun trait de bordure : la séparation se fait par contraste de fond et ombre portée (RULE 009).
 */

/* ── Tiroir latéral ─────────────────────────────────────────────── */

export function LegDrawer({ open, onOpenChange, kicker, title, subtitle, children, footer, className }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kicker?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="lg-overlay" />
        <Dialog.Content className={cx("lg-drawer", className)} aria-describedby={undefined} onOpenAutoFocus={(event) => { event.preventDefault(); (event.currentTarget as HTMLElement).querySelector(".lg-drawer-body")?.scrollTo({ top: 0 }) }}>
          <header className="lg-drawer-head">
            <div className="lg-drawer-titles">
              {kicker ? <p className="lg-kicker">{kicker}</p> : null}
              <Dialog.Title className="lg-title">{title}</Dialog.Title>
              {subtitle ? <p className="lg-sub">{subtitle}</p> : null}
            </div>
            <Dialog.Close className="lg-close" aria-label="Fermer"><LegIcon name="close" /></Dialog.Close>
          </header>
          <div className="lg-drawer-body">{children}</div>
          {footer ? <footer className="lg-drawer-foot">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ── Dialogue de confirmation ───────────────────────────────────── */

export function LegConfirm({ open, onOpenChange, title, description, confirmLabel, destructive = false, busy = false, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="lg-overlay" />
        <Dialog.Content className="lg-dialog" aria-describedby="lg-confirm-desc">
          <span className={cx("lg-socle lg-socle--lg", destructive ? "lg-socle--red" : "lg-socle--navy")}><LegIcon name={destructive ? "alert" : "shield"} /></span>
          <Dialog.Title className="lg-dialog-title">{title}</Dialog.Title>
          <Dialog.Description id="lg-confirm-desc" className="lg-dialog-text">{description}</Dialog.Description>
          <div className="lg-dialog-actions">
            <LegButton variant="ghost" onClick={() => onOpenChange(false)}>Annuler</LegButton>
            <LegButton variant={destructive ? "danger" : "primary"} loading={busy} onClick={onConfirm}>{confirmLabel}</LegButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ── Bouton pilule ──────────────────────────────────────────────── */

type LegButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "danger" | "ghost"
  icon?: LegIconName
  loading?: boolean
  block?: boolean
}

export const LegButton = React.forwardRef<HTMLButtonElement, LegButtonProps>(function LegButton({ variant = "primary", icon, loading = false, block = false, className, children, disabled, type = "button", ...props }, ref) {
  return (
    <button ref={ref} type={type} className={cx("lg-btn", `lg-btn--${variant}`, block && "lg-btn--block", className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <span className="lg-spinner" aria-hidden="true" /> : icon ? <LegIcon name={icon} /> : null}
      <span>{children}</span>
    </button>
  )
})

/* ── Socle d'icône : couleur PLEINE analogue, jamais de teinte translucide (RULE 007) ── */

export type SocleTone = "violet" | "navy" | "green" | "amber" | "teal" | "brick" | "red" | "platinum"

export function LegSocle({ icon, tone = "violet", size = "md", className }: { icon: LegIconName; tone?: SocleTone; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  return <span className={cx("lg-socle", `lg-socle--${size}`, `lg-socle--${tone}`, className)}><LegIcon name={icon} /></span>
}

/* ── Pastille d'état ────────────────────────────────────────────── */

export function LegPill({ tone = "neutral", icon, children, className }: { tone?: "ok" | "warn" | "danger" | "neutral" | "navy"; icon?: LegIconName; children: React.ReactNode; className?: string }) {
  return <span className={cx("lg-pill", `lg-pill--${tone}`, className)}>{icon ? <LegIcon name={icon} /> : <i aria-hidden="true" />}{children}</span>
}

/* ── Fenêtre modale large (formulaires) ─────────────────────────── */

export function LegModal({ open, onOpenChange, icon, tone = "navy", title, description, children, footer, dismissible = true, wide = false }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  icon?: LegIconName
  tone?: SocleTone
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  /** false : ni clic à côté ni Échap ne ferment (ex. un secret affiché une seule fois). */
  dismissible?: boolean
  wide?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="lg-overlay" />
        <Dialog.Content
          className={cx("lg-dialog", wide && "lg-dialog--wide")}
          aria-describedby={description ? "lg-modal-desc" : undefined}
          onInteractOutside={dismissible ? undefined : (event) => event.preventDefault()}
          onEscapeKeyDown={dismissible ? undefined : (event) => event.preventDefault()}
        >
          {icon ? <LegSocle icon={icon} tone={tone} size="lg" /> : null}
          <Dialog.Title className="lg-dialog-title">{title}</Dialog.Title>
          {description ? <Dialog.Description id="lg-modal-desc" className="lg-dialog-text">{description}</Dialog.Description> : null}
          {children ? <div className="lg-dialog-body">{children}</div> : null}
          {footer ? <div className="lg-dialog-actions">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ── Onglets : segments pilule défilants ────────────────────────── */

export function LegTabs<T extends string>({ tabs, value, onChange, label, idPrefix }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string; idPrefix: string }) {
  return (
    <div role="tablist" aria-label={label} className="lg-seg lg-seg--scroll">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" id={`${idPrefix}-tab-${tab.id}`} aria-selected={value === tab.id} aria-pressed={value === tab.id} aria-controls={`${idPrefix}-panel-${tab.id}`} onClick={() => onChange(tab.id)}>{tab.label}</button>
      ))}
    </div>
  )
}

/* ── Section + ligne libellé/valeur ─────────────────────────────── */

export function LegSection({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title ? <p className="lg-kicker lg-section-title">{title}</p> : null}
      <div className="lg-panel">{children}</div>
    </section>
  )
}

export function LegRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="lg-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
/* ── Motif obligatoire : toute action sensible se justifie (et le motif entre au journal) ── */

export function LegReasonDialog({ open, onOpenChange, title, description, confirmLabel, destructive = false, busy = false, minLength = 8, icon, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  minLength?: number
  icon?: LegIconName
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = React.useState("")
  React.useEffect(() => { if (!open) setReason("") }, [open])
  const valid = reason.trim().length >= minLength
  return (
    <LegModal
      open={open}
      onOpenChange={onOpenChange}
      icon={icon ?? (destructive ? "alert" : "pencil")}
      tone={destructive ? "red" : "navy"}
      title={title}
      description={description}
      footer={<>
        <LegButton variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</LegButton>
        <LegButton variant={destructive ? "danger" : "primary"} disabled={!valid} loading={busy} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</LegButton>
      </>}
    >
      <div>
        <label className="lg-label" htmlFor="lg-reason">Motif (obligatoire)</label>
        <textarea id="lg-reason" className="lg-input lg-textarea" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Pourquoi cette action ? Le motif est conservé dans le journal." maxLength={250} autoFocus />
        <p className="lg-hint">{reason.trim().length < minLength ? `${minLength} caractères minimum.` : "Le motif sera visible dans l'historique."}</p>
      </div>
    </LegModal>
  )
}