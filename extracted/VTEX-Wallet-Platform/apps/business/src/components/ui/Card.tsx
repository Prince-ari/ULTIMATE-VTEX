import { clsx } from "clsx"

interface CardProps {
  children: React.ReactNode
  className?: string
  as?: "div" | "section" | "article"
}

/** Carte LEGDAY : radius 20, surface s1, border discrète, shadow-card. */
export function Card({ children, className, as = "div" }: CardProps) {
  const Comp = as
  return (
    <Comp
      className={clsx(
        "rounded-[20px] border border-white/5 bg-[var(--c-s1)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </Comp>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <header className={clsx("flex items-start justify-between gap-4 border-b border-white/5 px-6 py-5", className)}>
      {children}
    </header>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[16px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--c-t1)]">{children}</h2>
}

export function CardSubtitle({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[12px] leading-[1.5] text-[var(--c-t3)]">{children}</p>
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("px-6 py-5", className)}>{children}</div>
}
