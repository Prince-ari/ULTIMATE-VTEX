"use client"

import * as React from "react"

import { NETWORK_LABEL, groupPan, maskedPan, type CardNetwork, type CardTheme } from "@/lib/cardFormat"
import { cx } from "@/lib/utils"

/**
 * Face de carte du Dashboard (Leg Day). Toute la géométrie est en unités de conteneur (`cqw`) : la carte garde ses proportions
 * (ratio 1,586:1, référence 400×252) de la galerie à la fiche, sans jamais dépendre de la largeur de son parent pour ses proportions.
 * Le numéro n'est lisible que lorsque `pan` est fourni ; sinon seuls les quatre derniers chiffres apparaissent.
 */
export interface CardFaceProps {
  theme: CardTheme
  network: CardNetwork
  /** « Carte personnelle », « Entreprise »… */
  kind: string
  lastFour: string
  /** Numéro complet — fourni uniquement pendant une révélation ou la saisie. */
  pan?: string | null
  holder: string
  expiry: string
  status?: "active" | "frozen" | "expired" | "cancelled"
  /** 0..1 : progression du remasquage automatique (barre en pied de carte). */
  remaining?: number | null
  className?: string
}

const STATUS_FLAG: Record<string, string> = { frozen: "Gelée", expired: "Expirée", cancelled: "Annulée" }

function Chip() {
  const id = React.useId()
  return (
    <svg className="cf-chip" viewBox="0 0 44 34" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3DA9A" />
          <stop offset=".55" stopColor="#E0B95E" />
          <stop offset="1" stopColor="#B98A34" />
        </linearGradient>
      </defs>
      <rect width="44" height="34" rx="7" fill={`url(#${id})`} />
      <path d="M0 12h14v10H0M30 12h14v10H30M14 0v34M30 0v34M14 17h16" stroke="rgba(90,60,10,.42)" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function Contactless() {
  return (
    <svg className="cf-nfc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M8 6.5a8 8 0 0 1 0 11" />
      <path d="M12 4a12 12 0 0 1 0 16" />
      <path d="M16 1.5a16 16 0 0 1 0 21" />
    </svg>
  )
}

function NetworkMark({ network }: { network: CardNetwork }) {
  if (network === "mastercard") {
    return (
      <svg className="cf-net cf-net--mc" viewBox="0 0 48 30" role="img" aria-label="Mastercard">
        <circle cx="17" cy="15" r="13" fill="#EB001B" />
        <circle cx="31" cy="15" r="13" fill="#F79E1B" />
        <path d="M24 4.05A13 13 0 0 1 24 25.95A13 13 0 0 1 24 4.05Z" fill="#FF5F00" />
      </svg>
    )
  }
  return <span className={cx("cf-net", network === "visa" ? "cf-net--visa" : "cf-net--cb")} aria-label={NETWORK_LABEL[network]}>{network === "visa" ? "VISA" : "CB"}</span>
}

/** Numéro : un `<span>` par caractère pour que la révélation « retombe » chiffre par chiffre (animation décalée, désactivée en mouvement réduit). */
function Digits({ text }: { text: string }) {
  let index = 0
  return (
    <>
      {[...text].map((char, position) => char === " " ? <span key={position} className="cf-sp" /> : <span key={position} className="cf-ch" style={{ "--i": index++ } as React.CSSProperties}>{char}</span>)}
    </>
  )
}

export function CardFace({ theme, network, kind, lastFour, pan, holder, expiry, status = "active", remaining = null, className }: CardFaceProps) {
  const revealed = typeof pan === "string" && pan.length > 0
  const shown = revealed ? groupPan(pan) : maskedPan(lastFour)
  return (
    <div className="cf-wrap">
      <div className={cx("cf", `cf--${theme}`, className)} data-testid="card-face" data-status={status} data-revealed={revealed} role="group" aria-label={`Carte ${NETWORK_LABEL[network]} se terminant par ${lastFour}, expire ${expiry}`}>
        <div className="cf-top">
          <span className="cf-kind">{kind}</span>
          {status !== "active" ? <span className="cf-flag">{STATUS_FLAG[status]}</span> : <span className="cf-brand">VTEX</span>}
        </div>
        <div className="cf-mid"><Chip /><Contactless /></div>
        <div key={revealed ? "on" : "off"} className="cf-num" data-revealed={revealed} aria-label={revealed ? `Numéro ${pan}` : `Numéro masqué, se terminant par ${lastFour}`}>
          <span aria-hidden="true"><Digits text={shown} /></span>
        </div>
        <div className="cf-foot">
          <div className="cf-cell cf-cell--grow"><span className="cf-lbl">Titulaire</span><span className="cf-val">{holder || "—"}</span></div>
          <div className="cf-cell"><span className="cf-lbl">Expire</span><span className="cf-val cf-val--mono">{expiry}</span></div>
          <NetworkMark network={network} />
        </div>
        {revealed && remaining !== null ? <div className="cf-timer" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, remaining)) * 100}%` }} /></div> : null}
      </div>
    </div>
  )
}
