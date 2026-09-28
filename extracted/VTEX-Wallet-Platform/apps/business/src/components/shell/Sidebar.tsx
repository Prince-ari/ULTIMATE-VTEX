"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { DASHBOARD_NAV, NAV_GROUPS } from "@/lib/nav"
import { Icon } from "@/components/ui/Icon"

/** Sidebar Business — visible en permanence à partir de lg (>=1024px),
 *  Drawer déclenché depuis la Topbar en dessous. La disposition suit
 *  strictement LEGDAY §5 (kicker eyebrow 11 px, socle 32 px, active state
 *  signature translucide). */
export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop rail — sticky, always visible from lg */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r border-white/5 bg-[var(--c-s1)] lg:flex lg:flex-col">
        <SidebarContent activePath={pathname} />
      </aside>

      {/* Mobile drawer — same content, wrapped in a slide-in panel */}
      <MobileSidebar activePath={pathname} />
    </>
  )
}

function SidebarContent({ activePath }: { activePath: string }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-5 pb-4 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-[14px] border border-white/10 bg-[#0E1230] px-3 py-2 legday-focus"
        >
          <span className="font-mono text-[10px] font-bold tracking-[.14em] text-[var(--c-t1)]">
            VTEX
          </span>
          <span className="legday-kicker text-[9px] text-[var(--c-t2)]">Business</span>
        </Link>
        <p className="mt-2 legday-kicker text-[9px]">Espace pro</p>
      </div>

      <nav className="flex-1 px-3 pb-6">
        <SidebarItem item={DASHBOARD_NAV} active={activePath === "/"} />

        {NAV_GROUPS.map((group) => (
          <section key={group.kicker} className="mt-5">
            <p className="legday-kicker mb-1 px-3 text-[9px] text-[var(--c-t3)]">{group.kicker}</p>
            <ul className="space-y-[2px]">
              {group.items.map((item) => (
                <li key={item.href}>
                  <SidebarItem
                    item={item}
                    active={activePath === item.href || activePath.startsWith(item.href + "/")}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="border-t border-white/5 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#4a5290] via-[#2a316a] to-[#1a1f4d] text-[13px] font-bold">
            AK
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-[var(--c-t1)]">
              Ariel Kouadio
            </div>
            <div className="truncate text-[11px] text-[var(--c-t3)]">Owner · Selego SAS</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SidebarItem({
  item,
  active,
}: {
  item: { label: string; href: string; icon: import("@/lib/nav").IconName; live?: boolean }
  active: boolean
}) {
  return (
    <Link
      href={item.href}
      className={
        "group flex items-center gap-3 rounded-[14px] px-3 py-2 text-[13px] font-semibold transition-colors legday-focus " +
        (active
          ? "bg-[var(--tint-primary)] text-[var(--c-signature)]"
          : "text-[var(--c-t2)] hover:bg-white/[.04] hover:text-[var(--c-t1)]")
      }
    >
      <span
        className={
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] " +
          (active ? "bg-[var(--c-signature)]/15 text-[var(--c-signature)]" : "text-[var(--c-t3)] group-hover:text-[var(--c-t1)]")
        }
        aria-hidden="true"
      >
        <Icon name={item.icon} size={18} />
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.live && (
        <span className="rounded-full bg-[var(--c-positive)]/15 px-2 py-[2px] text-[9px] font-bold uppercase tracking-widest text-[var(--c-positive)]">
          Live
        </span>
      )}
    </Link>
  )
}

function MobileSidebar({ activePath }: { activePath: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/10 bg-[var(--c-s1)] text-[var(--c-t2)] shadow-lg lg:hidden legday-focus"
        aria-label="Ouvrir la navigation"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M4 6h16v2H4Zm0 5h16v2H4Zm0 5h16v2H4Z" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 flex h-full w-[86%] max-w-[320px] flex-col border-r border-white/5 bg-[var(--c-s1)] shadow-2xl animate-slideInLeft">
            <div className="flex items-center justify-between px-4 pt-4">
              <div className="legday-kicker text-[9px]">Navigation</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-[var(--c-t2)] legday-focus"
                aria-label="Fermer la navigation"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6 18 18M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="flex-1" onClick={() => setOpen(false)}>
              <SidebarContent activePath={activePath} />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
