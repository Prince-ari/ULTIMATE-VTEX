interface KpiItem {
  label: string
  value: string
  hint?: string
}

/** Indicateurs d'un module — Leg Day : surface propre (élément non cliquable : pas de couleur pleine), aucun trait, matière par l'ombre. */
export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="dashboard-module-kpis grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="dashboard-module-kpi flex min-w-0 flex-col justify-between p-4">
          <p className="lg-kicker">{item.label}</p>
          <p className="mt-3 whitespace-nowrap text-2xl font-extrabold leading-none tracking-[-0.03em] tabular-nums text-[#0a0d1e]">
            {item.value}
          </p>
          {item.hint ? (
            <p className="mt-2 truncate text-xs leading-4 text-[#6b7396]">
              {item.hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
