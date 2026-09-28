interface PageHeaderProps {
  kicker?: string
  title: string
  description?: string
  actions?: React.ReactNode
}

export function PageHeader({ kicker, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {kicker && <p className="legday-kicker mb-2">{kicker}</p>}
        <h1 className="text-[28px] font-extrabold leading-[1.05] tracking-[-0.035em] text-[var(--c-t1)]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[62ch] text-[14px] leading-[1.55] text-[var(--c-t2)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
