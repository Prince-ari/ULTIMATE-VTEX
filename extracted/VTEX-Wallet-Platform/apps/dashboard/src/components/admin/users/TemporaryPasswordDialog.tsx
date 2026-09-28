"use client"

import * as React from "react"

import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegModal } from "@/components/ui/legkit"
import { formatDateTime } from "@/lib/adminFormat"

/**
 * Affiche UNE fois le mot de passe temporaire généré par le serveur. Il n'est stocké nulle part en clair : fermer cette fenêtre le
 * rend irrécupérable (il faudra en générer un nouveau). Elle ne se ferme pas par un clic à côté, pour éviter une perte accidentelle.
 */
export function TemporaryPasswordDialog({
  open,
  onClose,
  title,
  email,
  password,
  expiresAt,
}: {
  open: boolean
  onClose: () => void
  title: string
  email: string
  password: string
  expiresAt: string | Date
}) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false) // Presse-papiers indisponible : le mot de passe reste sélectionnable à l'écran.
    }
  }

  return (
    <LegModal
      open={open}
      onOpenChange={(value) => { if (!value) { setCopied(false); onClose() } }}
      dismissible={false}
      icon="key"
      tone="amber"
      title={title}
      description={<>Compte : <strong>{email}</strong></>}
      footer={<LegButton onClick={() => { setCopied(false); onClose() }}>J’ai transmis le mot de passe</LegButton>}
    >
      <div className="lg-secret">
        <code data-testid="temporary-password">{password}</code>
        <LegButton variant="secondary" icon={copied ? "check" : "copy"} onClick={() => void copy()} aria-label="Copier le mot de passe temporaire">{copied ? "Copié" : "Copier"}</LegButton>
      </div>
      <p className="lg-notice" role="note">
        <LegIcon name="alert" />
        <span>
          Ce mot de passe ne sera plus jamais affiché. Transmettez-le par un canal sûr : la personne devra le remplacer dès sa première connexion,
          et il expire le <strong>{formatDateTime(expiresAt)}</strong>.
        </span>
      </p>
    </LegModal>
  )
}
