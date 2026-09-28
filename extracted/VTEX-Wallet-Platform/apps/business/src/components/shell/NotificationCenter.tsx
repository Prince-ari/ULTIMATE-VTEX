"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { Icon } from "@/components/ui/Icon"
import { api } from "@/lib/trpc"

type Item = inferRouterOutputs<AppRouter>["notifications"]["listMine"][number]

const POLL_MS = 45_000
const ROLE_LABEL: Record<string, string> = { account_manager: "Votre gestionnaire", agent: "Support", admin: "Administration", super_admin: "Administration" }

function ago(value: Date | string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return "à l'instant"
  if (seconds < 3_600) return `il y a ${Math.floor(seconds / 60)} min`
  if (seconds < 86_400) return `il y a ${Math.floor(seconds / 3_600)} h`
  if (seconds < 30 * 86_400) return `il y a ${Math.floor(seconds / 86_400)} j`
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))
}

/**
 * Centre de notifications de Wallet Pro : les messages du serveur (paiements, système) et les SUGGESTIONS de l'équipe (support, gestionnaire, administrateur)
 * adressées à l'entreprise. Le compteur vient du serveur ; ouvrir un message le marque lu pour la personne connectée uniquement.
 */
export function NotificationCenter() {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<Item[] | null>(null)
  const [unread, setUnread] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const panelId = React.useId()

  const refreshCount = React.useCallback(async () => {
    try { setUnread(await api.notifications.unreadCount.query()) } catch { /* le compteur est facultatif : la page reste utilisable */ }
  }, [])
  const refreshList = React.useCallback(async () => {
    setError(null)
    try {
      const rows = await api.notifications.listMine.query()
      setItems(rows)
      setUnread(rows.filter((row) => !row.isRead).length)
    } catch (caught) {
      setItems([])
      setError(caught instanceof Error ? caught.message : "Notifications indisponibles.")
    }
  }, [])

  React.useEffect(() => {
    void refreshCount()
    const timer = window.setInterval(() => { if (!document.hidden) void refreshCount() }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [refreshCount])

  React.useEffect(() => {
    if (!open) return
    void refreshList()
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false) }
    function onDown(event: MouseEvent) { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown) }
  }, [open, refreshList])

  async function read(item: Item) {
    if (item.isRead) return
    setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)) ?? current)
    setUnread((count) => Math.max(0, count - 1))
    try { await api.notifications.markRead.mutate({ notificationId: item.id }) } catch { void refreshList() }
  }
  async function readAll() {
    try {
      await api.notifications.markAllRead.mutate()
      await refreshList()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action impossible.")
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/10 bg-[var(--c-s2)] text-[var(--c-t2)] legday-focus" aria-label={unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"} aria-haspopup="true" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)}>
        <Icon name="bell" size={18} />
        {unread > 0 ? <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--c-warm)] px-1 text-[10px] font-extrabold leading-none text-[#0a0d1e]" aria-hidden="true">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {open ? (
        <section id={panelId} aria-label="Notifications" className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] rounded-[24px] bg-[var(--c-s2)] p-3 shadow-[var(--shadow-lg)]">
          <header className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
            <h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-[var(--c-t1)]">Notifications</h2>
            {unread > 0 ? <button type="button" onClick={() => void readAll()} className="legday-focus rounded-full px-3 py-1 text-[12px] font-bold text-[var(--c-signature)] hover:bg-white/[.06]">Tout marquer comme lu</button> : null}
          </header>
          {error ? <p role="alert" className="mx-2 mb-2 rounded-[14px] bg-[var(--tint-danger)] px-3 py-2 text-[12px] font-semibold text-[var(--c-danger)]">{error}</p> : null}
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1" role="list">
            {items === null ? <p className="px-2 py-4 text-[13px] text-[var(--c-t3)]" role="status">Chargement…</p> : items.length === 0 ? <p className="px-2 py-6 text-center text-[13px] text-[var(--c-t3)]">Aucune notification pour le moment.</p> : items.map((item) => (
              <button key={item.id} type="button" role="listitem" onClick={() => void read(item)} className={`legday-focus flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left transition ${item.isRead ? "bg-transparent hover:bg-white/[.04]" : "bg-[var(--tint-primary)] hover:bg-[rgba(142,169,255,.22)]"}`}>
                <span className="mt-[2px] flex h-9 w-9 flex-none items-center justify-center rounded-full text-[#0a0d1e] shadow-[var(--shadow-socle)]" style={{ background: item.kind === "suggestion" ? "#97CE5E" : "#5FA8D8" }} aria-hidden="true">
                  <Icon name={item.kind === "suggestion" ? "people" : "bell"} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  {item.kind === "suggestion" && item.sender ? <span className="legday-kicker mb-1 block text-[9px]">Suggestion de {item.sender.firstName} · {ROLE_LABEL[item.sender.role ?? ""] ?? "Équipe"}</span> : null}
                  <span className="block text-[13px] font-bold leading-[1.3] text-[var(--c-t1)]">{item.title}</span>
                  <span className="mt-1 block text-[12px] leading-[1.5] text-[var(--c-t2)]">{item.body}</span>
                  <span className="mt-1 block text-[11px] text-[var(--c-t3)]">{ago(item.createdAt)}</span>
                </span>
                {!item.isRead ? <span className="mt-2 h-2 w-2 flex-none rounded-full bg-[var(--c-signature)]" aria-label="Non lue" /> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
