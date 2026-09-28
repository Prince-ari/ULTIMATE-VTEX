import * as React from "react"
import type { ReactNode } from "react"

/* Breakpoint sous lequel la table se transforme en cartes empilées. Le seuil
 * exact est laissé à la page appelante : un tableau de 4 colonnes légères tient
 * jusqu'à `md` (< 768 px), tandis qu'un tableau de 6 colonnes denses avec
 * colonne Actions gagne à basculer plus tôt (`lg` → < 1024 px). */
export type DataTableMobileBreakpoint = "sm" | "md" | "lg"

interface Column<T> {
  header: string
  render: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  emptyLabel?: string
  /* Bascule cartes / table. Défaut `md` (mêmes 720 px que le `min-w` d'avant :
   * on ne réduit pas le seuil, on remplace juste le débordement par un rendu
   * empilé propre — conforme au §30 de la roadmap. */
  mobileBreakpoint?: DataTableMobileBreakpoint
}

/* Media query correspondant à "en dessous du breakpoint Tailwind donné". */
const MOBILE_QUERIES: Record<DataTableMobileBreakpoint, string> = {
  sm: "(max-width: 639px)",
  md: "(max-width: 767px)",
  lg: "(max-width: 1023px)",
}

/* Classes utilitaires Tailwind synchronisées avec ce même breakpoint. Elles
 * sont rendues en plus du basculement JS pour que l'affichage reste correct
 * si le JS met un tick à s'installer, et pour préserver le rendu à
 * l'impression / dans les environnements sans matchMedia. */
const HIDE_ON_MOBILE: Record<DataTableMobileBreakpoint, string> = {
  sm: "hidden sm:block",
  md: "hidden md:block",
  lg: "hidden lg:block",
}
const SHOW_ON_MOBILE: Record<DataTableMobileBreakpoint, string> = {
  sm: "sm:hidden",
  md: "md:hidden",
  lg: "lg:hidden",
}

function useIsBelowBreakpoint(breakpoint: DataTableMobileBreakpoint): boolean {
  const query = MOBILE_QUERIES[breakpoint]
  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
      const mql = window.matchMedia(query)
      /* addEventListener est la voie moderne ; on retombe sur addListener pour
       * les navigateurs Safari <14 encore présents chez certains utilisateurs. */
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", notify)
        return () => mql.removeEventListener("change", notify)
      }
      mql.addListener(notify)
      return () => mql.removeListener(notify)
    },
    [query],
  )
  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia(query).matches
  }, [query])
  /* En SSR (Next) et en tests jsdom (pas de matchMedia), on démarre en mode
   * desktop : cela garde les snapshots serveur stables et évite un double
   * rendu de test des deux vues qui casserait les requêtes `getByText`. */
  const getServerSnapshot = React.useCallback(() => false, [])
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function isActionColumn<T>(column: Column<T>): boolean {
  const header = column.header.toLowerCase()
  return header === "actions" || header === "action" || header === "détail"
}

function MobileCards<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
}: Pick<DataTableProps<T>, "columns" | "rows" | "getRowKey" | "onRowClick">) {
  const [primary, ...rest] = columns
  const actionColumn = rest.find(isActionColumn)
  const detailColumns = actionColumn ? rest.filter((column) => column !== actionColumn) : rest

  return (
    <ul className="dashboard-data-cards space-y-3" aria-label="Résultats">
      {rows.map((row) => {
        const key = getRowKey(row)
        const interactive = Boolean(onRowClick)
        return (
          <li key={key} className="dashboard-data-card">
            {interactive ? (
              <button
                type="button"
                onClick={() => onRowClick?.(row)}
                className="dashboard-data-card-surface flex w-full flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900/60 dark:focus-visible:outline-gray-100"
              >
                <CardContent primary={primary} detailColumns={detailColumns} actionColumn={actionColumn} row={row} />
              </button>
            ) : (
              <div className="dashboard-data-card-surface flex w-full flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm dark:border-gray-800 dark:bg-gray-950">
                <CardContent primary={primary} detailColumns={detailColumns} actionColumn={actionColumn} row={row} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function CardContent<T>({
  primary,
  detailColumns,
  actionColumn,
  row,
}: {
  primary: Column<T>
  detailColumns: Column<T>[]
  actionColumn: Column<T> | undefined
  row: T
}) {
  return (
    <>
      <div className="dashboard-data-card-primary text-sm font-medium text-gray-900 dark:text-gray-50">
        {primary.render(row)}
      </div>
      {detailColumns.length > 0 && (
        <dl className="dashboard-data-card-meta grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
          {detailColumns.map((column) => (
            <div key={column.header} className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-500">
                {column.header}
              </dt>
              <dd className="text-sm text-gray-700 dark:text-gray-300">{column.render(row)}</dd>
            </div>
          ))}
        </dl>
      )}
      {actionColumn && (
        <div
          className="dashboard-data-card-actions flex flex-wrap items-center gap-2 pt-1"
          /* Un clic sur les boutons d'action ne doit pas déclencher onRowClick
           * de la carte parente. */
          onClick={(event) => event.stopPropagation()}
        >
          {actionColumn.render(row)}
        </div>
      )}
    </>
  )
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyLabel = "Aucun résultat.",
  mobileBreakpoint = "md",
}: DataTableProps<T>) {
  const isMobile = useIsBelowBreakpoint(mobileBreakpoint)

  if (rows.length === 0) {
    return (
      <div
        className="dashboard-data-empty rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400 dark:border-gray-800"
        role="status"
        aria-live="polite"
      >
        {emptyLabel}
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className={`dashboard-data-cards-wrap ${SHOW_ON_MOBILE[mobileBreakpoint]}`}>
        <MobileCards columns={columns} rows={rows} getRowKey={getRowKey} onRowClick={onRowClick} />
      </div>
    )
  }

  return (
    <div className={`dashboard-data-table overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 ${HIDE_ON_MOBILE[mobileBreakpoint]}`} role="region" aria-label="Tableau de données">
      <table className="w-full text-left text-sm">
        <thead className="dashboard-data-head border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.header}
                className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-500"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={
                onRowClick
                  ? "dashboard-data-row cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/60"
                  : "dashboard-data-row"
              }
            >
              {columns.map((col) => (
                <td
                  key={col.header}
                  className={`dashboard-data-cell whitespace-nowrap px-4 py-3 align-middle text-gray-700 dark:text-gray-300 ${col.className ?? ""}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
