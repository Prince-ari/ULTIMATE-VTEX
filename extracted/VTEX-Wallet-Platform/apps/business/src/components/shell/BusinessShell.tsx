"use client"

import { usePathname } from "next/navigation"

import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"
import { BusinessAuthGuard } from "@/lib/business-context"
import { DisplayCurrencyProvider, useDisplayCurrency } from "@/lib/display-currency"
import * as React from "react"

/** Remonte la page quand la devise d'affichage change : montants et champs pré-remplis repartent de la nouvelle devise. */
function PageByCurrency({ children }: { children: React.ReactNode }) {
  const { display } = useDisplayCurrency()
  return <React.Fragment key={display}>{children}</React.Fragment>
}

/** Chassis Business : sidebar fixe à gauche (>=lg), topbar sticky, main scrollable.
 *  Sur mobile la sidebar est un Drawer déclenché depuis la Topbar (§30/31 LEGDAY).
 *  /login et /change-password échappent volontairement au chassis et au garde de session : la première n'a pas encore de session,
 *  la seconde est précisément la page où le garde envoie un titulaire dont le mot de passe est temporaire. */
export function BusinessShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // /pay/[lien] est la page publique de paiement : le payeur n'a ni compte ni session, donc ni châssis ni garde.
  if (pathname === "/login" || pathname === "/change-password" || pathname?.startsWith("/pay/")) return <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-t1)]">{children}</div>
  // /topup est une page « reçu » plein écran (fond crème) : pas de sidebar/topbar, mais la session reste gardée.
  if (pathname === "/topup") return <BusinessAuthGuard><DisplayCurrencyProvider>{children}</DisplayCurrencyProvider></BusinessAuthGuard>

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-t1)]">
      <BusinessAuthGuard>
        <DisplayCurrencyProvider>
          <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1200px]"><PageByCurrency>{children}</PageByCurrency></div>
              </main>
            </div>
          </div>
        </DisplayCurrencyProvider>
      </BusinessAuthGuard>
    </div>
  )
}
