"use client"

import { Check, X, WarningCircle } from "@phosphor-icons/react"
import * as React from "react"

import { cx } from "@/lib/utils"

interface ToastItem {
  id: number
  message: string
  variant: "success" | "error"
}

interface ToastContextValue {
  show: (message: string, variant?: "success" | "error") => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const show = React.useCallback(
    (message: string, variant: "success" | "error" = "success") => {
      const id = nextId++
      setToasts((prev) => (
        prev.some((toast) => toast.message === message && toast.variant === variant)
          ? prev
          : [...prev, { id, message, variant }]
      ))
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 3500)
    },
    [],
  )

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite" aria-relevant="additions text">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className={cx(
              "dashboard-toast pointer-events-auto flex items-center gap-2 px-4 py-2.5 text-sm",
              "animate-slideLeftAndFade",
              t.variant === "success"
                ? "bg-white text-emerald-800 dark:bg-gray-900 dark:text-emerald-400"
                : "bg-white text-red-800 dark:bg-gray-900 dark:text-red-400",
            )}
          >
            {t.variant === "success" ? (
              <Check className="size-4 shrink-0" />
            ) : (
              <WarningCircle className="size-4 shrink-0" />
            )}
            <span>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Fermer"
              className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast doit être utilisé sous <ToastProvider>")
  }
  return ctx
}
