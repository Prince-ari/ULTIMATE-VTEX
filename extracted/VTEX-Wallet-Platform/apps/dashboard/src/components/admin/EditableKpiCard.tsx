"use client"

import * as React from "react"
import { PencilSimple } from "@phosphor-icons/react"

import { Input } from "@/components/Input"
import { Button } from "@/components/Button"

export function EditableKpiCard({
  label,
  displayValue,
  isOverridden,
  realDisplayValue,
  onSave,
  onClear,
  parse,
}: {
  label: string
  displayValue: string
  isOverridden: boolean
  realDisplayValue: string
  onSave: (raw: string) => void
  onClear: () => void
  /** Convertit la saisie utilisateur en nombre — renvoie null si invalide. */
  parse: (raw: string) => number | null
}) {
  const [editing, setEditing] = React.useState(false)
  const [raw, setRaw] = React.useState("")

  return (
    <div
      className={`dashboard-module-kpi group relative rounded-[18px] p-5 shadow-[0_2px_8px_rgba(15,18,48,0.04)] ${
        isOverridden
          ? "bg-[#fef8ee] dark:bg-amber-500/10"
          : "bg-white dark:bg-gray-900"
      }`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-500">{label}</p>
        {!editing && (
          <button
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => {
              setRaw("")
              setEditing(true)
            }}
            aria-label={`Modifier ${label}`}
          >
            <PencilSimple className="size-3.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-1.5 space-y-2">
          <Input
            autoFocus
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={realDisplayValue}
            className="h-7 text-xs"
          />
          <div className="flex gap-1.5">
            <Button
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                const value = parse(raw)
                if (value === null) return
                onSave(raw)
                setEditing(false)
              }}
            >
              Fixer
            </Button>
            <Button variant="secondary" className="h-6 px-2 text-[11px]" onClick={() => setEditing(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-xl font-semibold text-gray-900 dark:text-gray-50">{displayValue}</p>
          {isOverridden ? (
            <button
              className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-700 hover:underline dark:text-amber-400"
              onClick={onClear}
              title={`Valeur réelle : ${realDisplayValue}`}
            >
              ● Valeur fixée — revenir au réel ({realDisplayValue})
            </button>
          ) : (
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-600">Donnée réelle</p>
          )}
        </>
      )}
    </div>
  )
}
