"use client"

import dynamic from "next/dynamic"

import * as React from "react"

import { CurrencyToggle, DisplayCurrencyProvider, useMoney } from "@/lib/displayCurrency"

import { AuthGuard } from "./AuthGuard"
import { StaffLiveAlerts } from "./StaffLiveAlerts"

const Sidebar = dynamic(
  () => import("@/components/ui/navigation/sidebar").then((module) => module.Sidebar),
  {
    ssr: false,
    loading: () => <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-[292px] lg:bg-slate-950" aria-hidden="true" />,
  },
)

/** Remonte la page quand la devise d'affichage change : montants, champs pré-remplis et formulaires repartent tous de la nouvelle devise. */
function PageByCurrency({ children }: { children: React.ReactNode }) {
  const { display } = useMoney()
  return <React.Fragment key={display}>{children}</React.Fragment>
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DisplayCurrencyProvider>
        <StaffLiveAlerts />
        <Sidebar />
        <main className="vtex-dashboard-main lg:pl-[292px]">
          <div className="relative">
            <div className="p-4 sm:px-6 sm:pb-10 sm:pt-10 lg:px-10 lg:pt-7">
              <CurrencyToggle />
              <PageByCurrency>{children}</PageByCurrency>
            </div>
          </div>
        </main>
      </DisplayCurrencyProvider>
    </AuthGuard>
  )
}
