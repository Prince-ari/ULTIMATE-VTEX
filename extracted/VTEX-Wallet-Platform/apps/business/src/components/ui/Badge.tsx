import { clsx } from "clsx"

export type BadgeTone =
  | "neutral"
  | "signature"
  | "positive"
  | "warm"
  | "gold"
  | "danger"

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-white/[.06] text-[var(--c-t2)] border border-white/10",
  signature: "bg-[var(--tint-primary)] text-[var(--c-signature)] border border-[var(--c-signature)]/30",
  positive: "bg-[var(--tint-positive)] text-[var(--c-positive)] border border-[var(--c-positive)]/30",
  warm: "bg-[var(--tint-warm)] text-[var(--c-warm)] border border-[var(--c-warm)]/30",
  gold: "bg-[var(--tint-gold)] text-[var(--c-gold)] border border-[var(--c-gold)]/30",
  danger: "bg-[var(--tint-danger)] text-[var(--c-danger)] border border-[var(--c-danger)]/30",
}

interface BadgeProps {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-bold uppercase tracking-widest",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
