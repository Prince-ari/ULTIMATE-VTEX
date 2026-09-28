"use client"

import * as React from "react"

import { LegIcon } from "@/components/ui/LegIcon"

interface FilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters: { label: string; value: string }[]
  activeFilter: string
  onFilterChange: (value: string) => void
  action?: React.ReactNode
}

/** Recherche + filtres rapides — Leg Day : champ plein rayon 14, filtres en segments pilule (l'actif prend le dégradé navy). */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Rechercher...",
  filters,
  activeFilter,
  onFilterChange,
  action,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <LegIcon name="search" className="lg-input-lead" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="lg-input lg-input-icon"
          />
        </div>
        <div className="lg-seg lg-seg--scroll" role="group" aria-label="Filtres rapides">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={activeFilter === f.value}
              onClick={() => onFilterChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
