"use client"

import { NotificationCenter } from "@/components/shell/NotificationCenter"
import { Icon } from "@/components/ui/Icon"
import { useBusinessContext } from "@/lib/business-context"
import { CurrencySwitch } from "@/lib/display-currency"

/** Topbar : recherche globale + centre notif + switch entreprise + profil.
 *  Sticky en haut du main, laisse la Sidebar coller à sa gauche. */
export function Topbar() {
  const { business } = useBusinessContext()
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[var(--c-bg)]/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="ml-14 hidden min-w-0 flex-1 items-center gap-3 rounded-[14px] border border-white/5 bg-[var(--c-s2)] px-3 py-2 sm:flex sm:ml-0">
          <Icon name="search" size={16} className="text-[var(--c-t3)]" />
          <input
            type="search"
            placeholder="Rechercher un client, une facture, une transaction…"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--c-t3)]"
          />
          <kbd className="hidden rounded-[6px] border border-white/10 bg-white/5 px-1.5 py-[1px] font-mono text-[10px] text-[var(--c-t3)] sm:inline-block">
            Ctrl K
          </kbd>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <CurrencySwitch />
          <NotificationCenter />

          <button
            type="button"
            className="hidden h-10 items-center gap-2 rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3 md:inline-flex legday-focus"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#4a5290] via-[#2a316a] to-[#1a1f4d] text-[11px] font-bold text-white">
              {business.brandName.charAt(0).toUpperCase()}
            </span>
            <div className="text-left">
              <div className="text-[11px] leading-tight text-[var(--c-t3)]">Entreprise</div>
              <div className="text-[13px] font-semibold leading-tight text-[var(--c-t1)]">
                {business.brandName}
              </div>
            </div>
            <Icon name="cog" size={16} className="text-[var(--c-t3)]" />
          </button>
        </div>
      </div>
    </header>
  )
}
