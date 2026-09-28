import { clsx } from "clsx"

export interface Column<T> {
  header: string
  render: (row: T) => React.ReactNode
  className?: string
  align?: "left" | "right" | "center"
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string | number
  emptyLabel?: string
}

/** DataTable Business — même architecture que dashboard DataTable mais tokens
 *  navy-dark. Sur mobile la table devient une pile de cartes empilées. */
export function DataTable<T>({ columns, rows, getRowKey, emptyLabel = "Aucun résultat." }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div className="legday-empty">{emptyLabel}</div>
  }
  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden overflow-x-auto rounded-[20px] border border-white/5 bg-[var(--c-s1)] md:block">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="border-b border-white/5 bg-white/[.02]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.header}
                  className={clsx(
                    "whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-[var(--c-t3)]",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="hover:bg-white/[.02]">
                {columns.map((col) => (
                  <td
                    key={col.header}
                    className={clsx(
                      "whitespace-nowrap px-4 py-3 align-middle text-[var(--c-t1)]",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.className,
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — pile de cartes */}
      <ul className="space-y-3 md:hidden" aria-label="Résultats">
        {rows.map((row) => {
          const [primary, ...rest] = columns
          return (
            <li key={getRowKey(row)} className="rounded-[20px] border border-white/5 bg-[var(--c-s1)] p-4 shadow-[var(--shadow-card)]">
              <div className="mb-3 text-[14px] font-bold text-[var(--c-t1)]">{primary.render(row)}</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                {rest.map((col) => (
                  <div key={col.header} className="flex flex-col">
                    <dt className="legday-kicker text-[9px]">{col.header}</dt>
                    <dd className="mt-[2px] text-[var(--c-t1)]">{col.render(row)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          )
        })}
      </ul>
    </>
  )
}
