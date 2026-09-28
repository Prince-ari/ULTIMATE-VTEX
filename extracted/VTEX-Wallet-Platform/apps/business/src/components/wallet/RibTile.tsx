"use client"

import * as React from "react"

import { KALEIDO, type KaleidoKey } from "@/components/dashboard/KaleidoTile"
import { Icon } from "@/components/ui/Icon"

/**
 * Tuile RIB — protocole Leg Day complet : couleur pleine analogue (dégradé 158°), socle contrasté, glyphe simple, matière (ombre + liseré).
 * Toute la tuile est cliquable : elle copie l'IBAN. L'IBAN est en Mono (identifiant, RULE 006), jamais un titre.
 */
export function RibTile({ kicker, title, iban, bic, bankName, palette, featured = false }: { kicker: string; title: string; iban: string; bic?: string | null; bankName?: string; palette: KaleidoKey; featured?: boolean }) {
  const p = KALEIDO[palette]
  const [copied, setCopied] = React.useState(false)
  const groups = iban.replace(/\s+/g, "").match(/.{1,4}/g) ?? []

  async function copy() {
    try {
      await navigator.clipboard.writeText(groups.join(" "))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copier l'IBAN — ${title}`}
      className="group relative flex flex-col justify-between gap-6 overflow-hidden rounded-[32px] p-6 text-left legday-focus shadow-[0_10px_28px_-10px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.18)] transition-transform hover:-translate-y-[3px] active:scale-[.985]"
      style={{ background: p.gradient, color: p.surfaceInk, minHeight: featured ? 220 : 190 }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle at center, rgba(255,255,255,.18), transparent 65%)" }} />
      <span className="relative flex items-center justify-between">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: p.socle, color: p.glyph, boxShadow: "inset 0 1px 0 rgba(255,255,255,.5), inset 0 -2px 4px rgba(0,0,0,.15), 0 6px 16px -6px rgba(0,0,0,.4)" }}
        >
          <Icon name={featured ? "building" : "link"} size={24} />
        </span>
        <span className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold" style={{ background: "rgba(255,255,255,.16)", color: p.surfaceInk }} role="status" aria-live="polite">
          <Icon name={copied ? "check" : "copy"} size={13} />
          {copied ? "Copié" : "Copier"}
        </span>
      </span>
      <span className="relative block">
        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: p.subInk }}>{kicker}</span>
        <span className="block text-[19px] font-extrabold leading-[1.05] tracking-[-0.02em]">{title}</span>
        <span className="mt-4 block font-mono text-[15px] font-semibold leading-[1.5] tracking-[.03em]" data-testid="rib-iban">{groups.join(" ")}</span>
        <span className="mt-2 block text-[12px]" style={{ color: p.subInk }}>{[bankName, bic ? `BIC ${bic}` : null].filter(Boolean).join(" · ")}</span>
      </span>
    </button>
  )
}
