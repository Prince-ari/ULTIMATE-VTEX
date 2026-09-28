import { clsx } from "clsx"

type Tone = "neutral" | "positive" | "warm" | "gold" | "signature" | "danger"

const TONE_COLOR: Record<Tone, string> = {
  neutral: "text-[var(--c-t1)]",
  positive: "text-[var(--c-positive)]",
  warm: "text-[var(--c-warm)]",
  gold: "text-[var(--c-gold)]",
  signature: "text-[var(--c-signature)]",
  danger: "text-[var(--c-danger)]",
}

interface KpiTileProps {
  kicker: string
  value: string
  delta?: { value: string; tone: "positive" | "warm" | "neutral" }
  hint?: string
  tone?: Tone
}

/** Tuile KPI conforme LEGDAY : kicker eyebrow 11px + value 28px 800 + hint 12px. */
export function KpiTile({ kicker, value, delta, hint, tone = "neutral" }: KpiTileProps) {
  return (
    <div className="rounded-[20px] border border-white/5 bg-[var(--c-s1)] p-5 shadow-[var(--shadow-card)]">
      <p className="legday-kicker mb-3">{kicker}</p>
      <div className={clsx("text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em]", TONE_COLOR[tone])}>
        {value}
      </div>
      {delta && (
        <div className="mt-2 flex items-center gap-1">
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-bold",
              delta.tone === "positive" &&
                "bg-[var(--c-positive)]/15 text-[var(--c-positive)]",
              delta.tone === "warm" && "bg-[var(--c-warm)]/15 text-[var(--c-warm)]",
              delta.tone === "neutral" && "bg-white/5 text-[var(--c-t2)]",
            )}
          >
            {delta.value}
          </span>
          {hint && <span className="text-[11px] text-[var(--c-t3)]">{hint}</span>}
        </div>
      )}
      {!delta && hint && <p className="mt-2 text-[12px] text-[var(--c-t3)]">{hint}</p>}
    </div>
  )
}
