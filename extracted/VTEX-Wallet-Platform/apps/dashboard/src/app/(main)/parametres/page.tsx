"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { useToast } from "@/components/admin/Toast"
import { api } from "@/lib/trpc"
import { useMoney } from "@/lib/displayCurrency"
import { EUR_XPF_RATE, format } from "@vtex/money"

type PlatformSettings = inferRouterOutputs<AppRouter>["settings"]["getAdmin"]
type TopupLimits = inferRouterOutputs<AppRouter>["walletAdmin"]["stripeStatus"]["limits"]

export default function ParametresPage() {
  const { show } = useToast()
  const { display } = useMoney()
  const [settings, setSettings] = React.useState<PlatformSettings | null>(null)
  const [limits, setLimits] = React.useState<TopupLimits | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    api.walletAdmin.stripeStatus.query().then((status) => setLimits(status.limits)).catch(() => setLimits(null))
    api.settings.getAdmin
      .query()
      .then(setSettings)
      .catch(() => show("Impossible de charger les paramètres.", "error"))
      .finally(() => setLoading(false))
  }, [show])

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      await api.settings.update.mutate(settings)
      show("Paramètres enregistrés.")
    } catch (err) {
      show(err instanceof Error ? err.message : "Enregistrement impossible.", "error")
    } finally {
      setSaving(false)
    }
  }

  if (loading || !settings) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400 dark:border-gray-800">
        Chargement des paramètres...
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
          Paramètres
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          Configuration produit visible et journalisée. Les paramètres d’infrastructure restent isolés dans l’environnement de déploiement.
        </p>
      </div>

      <Section title="Identité">
        <Field label="Nom de la plateforme">
          <Input
            value={settings.platformName}
            onChange={(e) => setSettings((s) => (s ? { ...s, platformName: e.target.value } : s))}
          />
        </Field>
        <Field label="URL du logo">
          <Input value={settings.logoUrl ?? ""} onChange={(e) => setSettings((s) => (s ? { ...s, logoUrl: e.target.value || null } : s))} placeholder="https://…/logo.svg" />
        </Field>
        <p className="text-xs text-gray-400">Le logo est propagé au Dashboard et au Wallet après enregistrement.</p>
      </Section>

      <Section title="Apparence">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700 dark:text-gray-300">Thème par défaut</span>
          <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-gray-800">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSettings((s) => (s ? { ...s, defaultTheme: t } : s))}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  settings.defaultTheme === t
                    ? "bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900"
                    : "text-gray-500"
                }`}
              >
                {t === "light" ? "Clair" : "Sombre"}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Devises et plafonds de recharge">
        <Field label="Devise d’affichage du Dashboard">
          <Input value={display === "XPF" ? "₣ Franc Pacifique" : "€ Euro"} disabled />
        </Field>
        <p className="text-xs text-gray-400">Elle se change en haut de chaque page (€ / ₣). Parité fixe : 1 € = {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(EUR_XPF_RATE)} ₣. Les comptes conservent leur devise d’ouverture et sont administrés individuellement depuis le module Wallet.</p>
        <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
          <p className="font-medium text-gray-900 dark:text-gray-50">Plafonds des recharges par carte</p>
          <p className="mt-1 text-xs text-gray-500">Un plafond par recharge pour chaque portefeuille, et un plafond cumulé sur 24 h commun ; contrôlés côté serveur et non contournables depuis l’interface.</p>
          {limits ? <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-gray-500">Maximum par recharge — wallet personnel</dt><dd className="font-medium">{format(limits.wallet.eur.perRechargeCents, "EUR")} · {format(limits.wallet.xpf.perRechargeCents, "XPF")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-gray-500">Maximum par recharge — Wallet Pro</dt><dd className="font-medium">{format(limits.business.eur.perRechargeCents, "EUR")} · {format(limits.business.xpf.perRechargeCents, "XPF")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-gray-500">Maximum cumulé sur 24 h, par portefeuille</dt><dd className="font-medium">{format(limits.wallet.eur.dailyCents, "EUR")} · {format(limits.wallet.xpf.dailyCents, "XPF")}</dd></div>
          </dl> : <p className="mt-2 text-xs text-gray-400">Plafonds indisponibles.</p>}
        </div>
      </Section>

      <Section title="Maintenance">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700 dark:text-gray-300">Mode maintenance</span>
          <button
            onClick={() =>
              setSettings((s) => (s ? { ...s, maintenanceMode: !s.maintenanceMode } : s))
            }
            className={`h-6 w-11 rounded-full transition ${settings.maintenanceMode ? "bg-red-500" : "bg-gray-200 dark:bg-gray-800"}`}
          >
            <span
              className={`block size-5 rounded-full bg-white shadow transition ${settings.maintenanceMode ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>
        {settings.maintenanceMode && (
          <Field label="Message affiché aux utilisateurs">
            <Input
              value={settings.maintenanceMessage ?? ""}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, maintenanceMessage: e.target.value } : s))
              }
              placeholder="VTEX est en maintenance, retour prévu à..."
            />
          </Field>
        )}
      </Section>

      <Section title="Configuration générale">
        <Field label="Email de support">
          <Input
            type="email"
            value={settings.supportEmail}
            onChange={(e) => setSettings((s) => (s ? { ...s, supportEmail: e.target.value } : s))}
          />
        </Field>
      </Section>

      <Section title="Statistiques de présentation">
        <p className="text-xs text-gray-400">Laissez un champ vide pour afficher la donnée réellement calculée. Les overrides ne changent jamais le ledger.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Utilisateurs actifs"><Input type="number" min="0" value={settings.statsActiveUsersOverride ?? ""} onChange={(e) => setSettings((s) => (s ? { ...s, statsActiveUsersOverride: e.target.value === "" ? null : Number(e.target.value) } : s))} /></Field>
          <Field label="Solde plateforme (centimes)"><Input type="number" min="0" value={settings.statsPlatformBalanceCentsOverride ?? ""} onChange={(e) => setSettings((s) => (s ? { ...s, statsPlatformBalanceCentsOverride: e.target.value === "" ? null : Number(e.target.value) } : s))} /></Field>
          <Field label="Transactions du mois"><Input type="number" min="0" value={settings.statsTransactionsThisMonthOverride ?? ""} onChange={(e) => setSettings((s) => (s ? { ...s, statsTransactionsThisMonthOverride: e.target.value === "" ? null : Number(e.target.value) } : s))} /></Field>
        </div>
      </Section>

      <Button disabled={saving} onClick={save}>
        {saving ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-b border-gray-100 pb-6 dark:border-gray-900">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
