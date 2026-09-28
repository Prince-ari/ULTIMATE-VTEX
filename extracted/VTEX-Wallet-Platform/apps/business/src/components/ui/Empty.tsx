import { Icon } from "@/components/ui/Icon"
import type { IconName } from "@/lib/nav"

interface EmptyProps {
  icon?: IconName
  title: string
  description?: string
  action?: React.ReactNode
}

export function Empty({ icon = "dot", title, description, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-[var(--c-s1)]/40 px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--tint-primary)] text-[var(--c-signature)]">
        <Icon name={icon} size={22} />
      </div>
      <h3 className="text-[16px] font-extrabold tracking-[-0.02em] text-[var(--c-t1)]">{title}</h3>
      {description && <p className="mt-2 max-w-[54ch] text-[13px] leading-[1.55] text-[var(--c-t2)]">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
