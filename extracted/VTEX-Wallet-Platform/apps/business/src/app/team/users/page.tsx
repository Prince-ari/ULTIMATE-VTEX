"use client"

import * as React from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

import { PageHeader } from "@/components/shell/PageHeader"
import { KpiTile } from "@/components/ui/KpiTile"
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { api } from "@/lib/trpc"
import { useBusinessContext } from "@/lib/business-context"

type Outputs = inferRouterOutputs<AppRouter>
type Member = Outputs["team"]["listMembers"][number]
type Role = Member["role"]
type AdminUser = Outputs["users"]["list"][number]

const STATUS_TONE: Record<Member["status"], BadgeTone> = { active: "positive", invited: "gold", suspended: "danger" }
const STATUS_LABEL: Record<Member["status"], string> = { active: "Actif", invited: "Invité", suspended: "Suspendu" }
const ROLE_TONE: Record<Role, BadgeTone> = { owner: "warm", admin: "signature", finance: "positive", support: "gold", viewer: "neutral" }
const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", finance: "Finance", support: "Support", viewer: "Viewer" }

function relative(value: Date | string | null) {
  if (!value) return "jamais connecté"
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  return `${Math.round(hours / 24)} j`
}

export default function TeamUsersPage() {
  const { businessId, user: me } = useBusinessContext()
  const [members, setMembers] = React.useState<Member[]>([])
  const [roleMatrix, setRoleMatrix] = React.useState<Outputs["team"]["roleMatrix"]>([])
  const [loading, setLoading] = React.useState(true)
  const [inviteOpen, setInviteOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    const [m, r] = await Promise.all([api.team.listMembers.query({ businessId }), api.team.roleMatrix.query()])
    setMembers(m); setRoleMatrix(r)
  }, [businessId])

  React.useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)) }, [load])

  async function updateStatus(memberId: number, status: "active" | "suspended") {
    const rows = await api.team.updateStatus.mutate({ businessId, memberId, status })
    setMembers(rows)
  }

  const active = members.filter((m) => m.status === "active").length
  const invited = members.filter((m) => m.status === "invited").length
  const roleCounts = members.reduce<Record<string, number>>((acc, m) => { acc[m.role] = (acc[m.role] ?? 0) + 1; return acc }, {})

  return (
    <>
      <PageHeader
        kicker="Team"
        title="Membres de l'équipe"
        description="Chaque personne a son propre identifiant, son rôle explicite et sa trace dans le journal d'audit. Aucun partage d'identifiant Owner autorisé."
        actions={<Button variant="primary" size="md" onClick={() => setInviteOpen((v) => !v)}><Icon name="plus" size={16} /> Inviter un membre</Button>}
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile kicker="Membres actifs" value={String(active)} hint={`${members.length} au total`} />
        <KpiTile kicker="Invitations en attente" value={String(invited)} tone="gold" />
        <KpiTile kicker="Rôles distincts" value={String(Object.keys(roleCounts).length)} hint="sur 5 disponibles" />
        <KpiTile kicker="Mon rôle" value={ROLE_LABEL[members.find((m) => m.userId === me.id)?.role ?? "viewer"]} />
      </section>

      {inviteOpen ? (
        <div className="mb-6">
          <InviteForm businessId={businessId} onDone={async () => { await load(); setInviteOpen(false) }} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader><div><CardTitle>Membres</CardTitle><CardSubtitle>{loading ? "Chargement…" : `${members.length} membre${members.length !== 1 ? "s" : ""}`}</CardSubtitle></div></CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-white/5">
              {members.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4a5290] via-[#2a316a] to-[#1a1f4d] text-[13px] font-bold text-white">
                    {u.name.split(" ").map((p) => p.charAt(0)).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-[var(--c-t1)]">{u.name}</span>
                      <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                      <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                    </div>
                    <div className="mt-[2px] flex flex-wrap items-center gap-2 text-[12px] text-[var(--c-t3)]">
                      <span>{u.email}</span><span aria-hidden="true">·</span><span>{relative(u.lastActiveAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {u.role !== "owner" && u.status === "active" ? <Button variant="ghost" size="sm" onClick={() => void updateStatus(u.id, "suspended")}>Suspendre</Button> : null}
                    {u.status === "suspended" ? <Button variant="ghost" size="sm" onClick={() => void updateStatus(u.id, "active")}>Réactiver</Button> : null}
                  </div>
                </li>
              ))}
              {members.length === 0 && !loading ? <li className="px-6 py-6 text-center text-[13px] text-[var(--c-t3)]">Aucun membre.</li> : null}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Matrice des rôles</CardTitle><CardSubtitle>Périmètre par défaut.</CardSubtitle></div></CardHeader>
          <CardBody className="space-y-4">
            {roleMatrix.map((r) => (
              <div key={r.role} className="rounded-[14px] border border-white/5 bg-[var(--c-s2)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Badge tone={ROLE_TONE[r.role]}>{ROLE_LABEL[r.role]}</Badge>
                  <span className="text-[11px] text-[var(--c-t3)]">{roleCounts[r.role] ?? 0} membre{(roleCounts[r.role] ?? 0) > 1 ? "s" : ""}</span>
                </div>
                <ul className="space-y-1 text-[12px] text-[var(--c-t2)]">
                  {r.can.map((c) => <li key={c} className="flex items-start gap-2"><Icon name="check" size={12} className="mt-[3px] text-[var(--c-positive)]" /><span>{c}</span></li>)}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  )
}

function InviteForm({ businessId, onDone }: { businessId: number; onDone: () => Promise<void> }) {
  const [query, setQuery] = React.useState("")
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [selected, setSelected] = React.useState<AdminUser | null>(null)
  const [role, setRole] = React.useState<Role>("viewer")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => { void api.users.list.query().then(setUsers).catch(() => setUsers([])) }, [])
  const candidates = React.useMemo(() => users.filter((u) => u.status === "active" && `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6), [query, users])

  async function submit() {
    if (!selected) return
    setBusy(true)
    try { await api.team.invite.mutate({ businessId, userId: selected.id, role }); await onDone() } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader><div><CardTitle>Inviter un membre</CardTitle><CardSubtitle>Le compte doit déjà exister sur VTEX.</CardSubtitle></div></CardHeader>
      <CardBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <span className="legday-kicker mb-1 block text-[9px]">Titulaire</span>
            <div className="flex items-center rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3">
              <input type="text" value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null) }} placeholder="Rechercher par nom ou email" className="w-full bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none" />
            </div>
            {query.trim() && !selected ? (
              <div className="mt-1 max-h-36 overflow-auto rounded-[12px] border border-white/10 bg-[var(--c-s2)] p-1">
                {candidates.length ? candidates.map((u) => (
                  <button type="button" key={u.id} onClick={() => { setSelected(u); setQuery(`${u.firstName} ${u.lastName} · ${u.email}`) }} className="block w-full rounded-[8px] px-2 py-1.5 text-left text-[12px] text-[var(--c-t2)] hover:bg-white/[.06] hover:text-[var(--c-t1)]">
                    {u.firstName} {u.lastName} · {u.email}
                  </button>
                )) : <p className="px-2 py-1 text-[12px] text-[var(--c-t3)]">Aucun résultat.</p>}
              </div>
            ) : null}
          </div>
          <div>
            <span className="legday-kicker mb-1 block text-[9px]">Rôle</span>
            <div className="rounded-[14px] border border-white/10 bg-[var(--c-s2)] px-3">
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full appearance-none bg-transparent py-2 text-[13px] text-[var(--c-t1)] outline-none">
                {(["viewer", "support", "finance", "admin", "owner"] as Role[]).map((r) => <option key={r} value={r} className="bg-[var(--c-s2)]">{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
          </div>
        </div>
        <Button variant="primary" size="md" disabled={busy || !selected} onClick={() => void submit()}>{busy ? "Invitation…" : "Envoyer l’invitation"}</Button>
      </CardBody>
    </Card>
  )
}
