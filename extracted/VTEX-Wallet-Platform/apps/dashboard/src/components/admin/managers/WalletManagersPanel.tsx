"use client"

import * as React from "react"
import Link from "next/link"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { useToast } from "@/components/admin/Toast"
import { LegIcon } from "@/components/ui/LegIcon"
import { LegButton, LegPill } from "@/components/ui/legkit"
import { MANAGER_ROLE_LABEL } from "@/lib/managerFormat"
import { api } from "@/lib/trpc"

type Outputs = inferRouterOutputs<AppRouter>
type WalletManager = Outputs["admin"]["managers"]["forWallet"][number]
type ManagerOption = Outputs["admin"]["managers"]["list"][number]

/**
 * « Gestionnaires » d'un wallet, dans la fiche du titulaire : qui le suit, et (administrateur) confier ce wallet à un gestionnaire actif sans quitter la fiche.
 * Le serveur décide (`managers.read` / `managers.manage`) et journalise l'attribution sur le wallet.
 */
export function WalletManagersPanel({ walletType, holderId, canManage, holderName }: { walletType: "PERSONAL" | "PROFESSIONAL"; holderId: number; canManage: boolean; holderName: string }) {
  const { show } = useToast()
  const [managers, setManagers] = React.useState<WalletManager[] | null>(null)
  const [options, setOptions] = React.useState<ManagerOption[]>([])
  const [choice, setChoice] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const [current, all] = await Promise.all([api.admin.managers.forWallet.query({ walletType, holderId }), canManage ? api.admin.managers.list.query({ status: "active" }) : Promise.resolve([])])
      setManagers(current)
      setOptions(all)
    } catch (caught) {
      setManagers([])
      setError(caught instanceof Error ? caught.message : "Gestionnaires indisponibles.")
    }
  }, [walletType, holderId, canManage])

  React.useEffect(() => { void load() }, [load])

  const available = options.filter((option) => !(managers ?? []).some((manager) => manager.id === option.id))

  async function assign() {
    if (!choice) return
    setBusy(true)
    try {
      await api.admin.managers.assign.mutate({ managerId: Number(choice), walletType, holderId })
      setChoice("")
      show(`Wallet « ${holderName} » confié au gestionnaire.`)
      await load()
    } catch (caught) {
      show(caught instanceof Error ? caught.message : "Attribution impossible.", "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lg-stack" aria-label={`Gestionnaires de ${holderName}`}>
      <p className="lg-kicker">Gestionnaires</p>
      {managers === null ? <p className="lg-hint" role="status">Chargement…</p> : managers.length === 0 ? <p className="lg-hint">{error ?? "Aucun gestionnaire ne suit ce wallet."}</p> : (
        <div className="mg-wallets" role="list">
          {managers.map((manager) => (
            <Link key={manager.id} href={`/gestionnaires?gestionnaire=${manager.id}`} className="mg-wallet" role="listitem">
              <span className="mg-avatar mg-avatar--sm" aria-hidden="true">{manager.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
              <span className="mg-wallet-main"><strong>{manager.name}</strong><small>{MANAGER_ROLE_LABEL[manager.role as keyof typeof MANAGER_ROLE_LABEL] ?? manager.role}{manager.status !== "active" ? " · suspendu" : ""}</small></span>
              {manager.status !== "active" ? <LegPill tone="danger">Suspendu</LegPill> : <LegIcon name="chevron" className="cards-row-chevron" />}
            </Link>
          ))}
        </div>
      )}
      {canManage && available.length > 0 ? (
        <div className="lg-inline-form">
          <div>
            <label className="lg-label" htmlFor={`wm-${walletType}-${holderId}`}>Confier ce wallet à</label>
            <select id={`wm-${walletType}-${holderId}`} className="lg-input" value={choice} onChange={(event) => setChoice(event.target.value)}>
              <option value="">Choisir un gestionnaire…</option>
              {available.map((option) => <option key={option.id} value={option.id}>{option.name} · {MANAGER_ROLE_LABEL[option.role]}</option>)}
            </select>
          </div>
          <LegButton variant="secondary" icon="plus" disabled={!choice} loading={busy} onClick={() => void assign()}>Attribuer</LegButton>
        </div>
      ) : null}
    </div>
  )
}
