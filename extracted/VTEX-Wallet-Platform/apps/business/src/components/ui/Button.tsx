import { clsx } from "clsx"
import Link from "next/link"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all disabled:opacity-50 disabled:pointer-events-none legday-focus whitespace-nowrap"

const SIZES: Record<Size, string> = {
  sm: "text-[12px] px-3 py-[6px] leading-none",
  md: "text-[13px] px-4 py-[9px] leading-none",
  lg: "text-[14px] px-5 py-[11px] leading-none",
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--c-signature)] text-[#0a0d1e] hover:bg-[#a4b8ff] shadow-[inset_0_1px_0_rgba(255,255,255,.35)]",
  secondary:
    "bg-white/[.06] text-[var(--c-t1)] border border-white/10 hover:bg-white/[.10]",
  ghost:
    "bg-transparent text-[var(--c-t2)] hover:bg-white/[.05] hover:text-[var(--c-t1)]",
  danger:
    "bg-[var(--c-danger)]/15 text-[var(--c-danger)] border border-[var(--c-danger)]/30 hover:bg-[var(--c-danger)]/25",
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button {...props} className={clsx(BASE, SIZES[size], VARIANTS[variant], className)}>
      {children}
    </button>
  )
}

interface ButtonLinkProps {
  href: string
  variant?: Variant
  size?: Size
  className?: string
  children: React.ReactNode
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: ButtonLinkProps) {
  return (
    <Link href={href} className={clsx(BASE, SIZES[size], VARIANTS[variant], className)}>
      {children}
    </Link>
  )
}
