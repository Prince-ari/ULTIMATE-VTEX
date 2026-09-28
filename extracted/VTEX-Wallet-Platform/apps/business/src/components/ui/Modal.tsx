"use client"

import * as React from "react"
import { createPortal } from "react-dom"

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  /** false : ni Échap ni clic à côté ne ferment (ex. un secret affiché une seule fois). */
  dismissible?: boolean
  tone?: "default" | "danger"
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Fenêtre modale Leg Day de Wallet Pro : surface pleine sans bordure, rayon 32, ombre portée.
 * Accessible : `role="dialog"`, focus piégé, Échap, défilement de la page verrouillé, focus rendu à l'élément d'origine.
 */
export function Modal({ open, onClose, title, description, children, footer, dismissible = true, tone = "default" }: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()

  React.useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>("[data-autofocus]")?.focus() ?? panel?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) { event.stopPropagation(); onClose(); return }
      if (event.key !== "Tab" || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => !item.hasAttribute("disabled"))
      if (items.length === 0) { event.preventDefault(); return }
      const first = items[0]!
      const last = items[items.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open, dismissible, onClose])

  if (!open || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={dismissible ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative flex max-h-[calc(100vh-32px)] w-full max-w-[520px] flex-col gap-4 overflow-y-auto rounded-[32px] bg-[var(--c-s2)] p-6 shadow-[var(--shadow-lg)] outline-none"
      >
        <span className={`flex h-12 w-12 items-center justify-center rounded-full shadow-[var(--shadow-socle)] ${tone === "danger" ? "bg-[var(--c-danger)] text-white" : "bg-[var(--c-signature)] text-[#0a0d1e]"}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">{tone === "danger" ? <path d="M12 2.8 22 20.2a1 1 0 0 1-.9 1.5H2.9a1 1 0 0 1-.9-1.5Zm-1 7v5h2v-5Zm0 6.8v2h2v-2Z" /> : <path d="M15.5 3.5a5 5 0 0 0-4.8 6.4L4 16.6V21h4.3l1.5-1.5v-2h2v-2h2l1.4-1.4a5 5 0 0 0 .3-10.6Zm-.5 3.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z" />}</svg>
        </span>
        <div>
          <h2 id={titleId} className="text-[20px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--c-t1)]">{title}</h2>
          {description ? <p id={descriptionId} className="mt-2 text-[13px] leading-[1.55] text-[var(--c-t2)]">{description}</p> : null}
        </div>
        {children}
        {footer ? <div className="mt-2 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
