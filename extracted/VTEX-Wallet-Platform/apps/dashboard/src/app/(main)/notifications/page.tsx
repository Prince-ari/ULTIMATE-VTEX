"use client"

import * as React from "react"
import { Plus } from "@phosphor-icons/react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { KpiRow } from "@/components/admin/KpiRow"
import { DataTable } from "@/components/admin/DataTable"
import { useToast } from "@/components/admin/Toast"
import { formatDateTime, STATUS_BADGE, STATUS_LABEL } from "@/lib/adminFormat"
import { api } from "@/lib/trpc"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"

type Outputs = inferRouterOutputs<AppRouter>
type AdminNotification = Outputs["notifications"]["list"][number]
type AdminUser = Outputs["users"]["list"][number]

export default function NotificationsPage() {
  const { show } = useToast()
  const [notifications, setNotifications] = React.useState<AdminNotification[]>([])
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)

  const refetch = React.useCallback(async () => {
    const [n, u] = await Promise.all([api.notifications.list.query(), api.users.list.query()])
    setNotifications(n)
    setUsers(u)
  }, [])

  React.useEffect(() => {
    setLoading(true)
    refetch()
      .catch(() => show("Impossible de charger les notifications.", "error"))
      .finally(() => setLoading(false))
  }, [refetch, show])

  React.useEffect(() => {
    const stream = new EventSource("/api/events")
    const refreshOnNotification = () => void refetch()
    stream.addEventListener("notification.created", refreshOnNotification)
    return () => stream.close()
  }, [refetch])

  function userLabel(userId: number) {
    const u = users.find((x) => x.id === userId)
    return u ? `${u.firstName} ${u.lastName}` : `#${userId}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Diffusions vers le Wallet.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="-ml-0.5 mr-1 size-4" />
          Nouvelle notification
        </Button>
      </div>

      <KpiRow
        items={[
          { label: "Total envoyées", value: String(notifications.length) },
          {
            label: "Programmées",
            value: String(notifications.filter((n) => n.status === "scheduled").length),
          },
          {
            label: "Diffusions à tous",
            value: String(notifications.filter((n) => n.targetUserId === null).length),
          },
          {
            label: "Ciblées",
            value: String(notifications.filter((n) => n.targetUserId !== null).length),
          },
        ]}
      />

      {loading ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400 dark:border-gray-800">
          Chargement des notifications...
        </div>
      ) : (
        <DataTable
          columns={[
            { header: "Titre", render: (n: AdminNotification) => n.title },
            {
              header: "Cible",
              render: (n: AdminNotification) =>
                n.targetUserId === null ? "Tous" : userLabel(n.targetUserId),
            },
            {
              header: "Statut",
              render: (n: AdminNotification) => (
                <Badge variant={STATUS_BADGE[n.status]}>{STATUS_LABEL[n.status]}</Badge>
              ),
            },
            {
              header: "Date",
              render: (n: AdminNotification) => formatDateTime(n.scheduledAt ?? n.createdAt),
            },
          ]}
          rows={notifications}
          getRowKey={(n) => n.id}
          emptyLabel="Aucune notification envoyée."
        />
      )}

      <CreateNotificationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users.filter((u) => u.role === "user")}
        onCreate={async (input) => {
          try {
            await api.notifications.create.mutate(input)
            await refetch()
            show(input.scheduledAt ? "Notification programmée." : "Notification envoyée.")
          } catch (err) {
            show(err instanceof Error ? err.message : "Envoi impossible.", "error")
          }
        }}
      />
    </div>
  )
}

function CreateNotificationDialog({
  open,
  onOpenChange,
  users,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  users: AdminUser[]
  onCreate: (input: { targetUserId: number | null; title: string; body: string; scheduledAt?: Date }) => void
}) {
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [target, setTarget] = React.useState<string>("all")
  const [scheduled, setScheduled] = React.useState(false)
  const [scheduledAt, setScheduledAt] = React.useState("")

  function reset() {
    setTitle("")
    setBody("")
    setTarget("all")
    setScheduled(false)
    setScheduledAt("")
  }

  const valid = title.trim() !== "" && body.trim() !== ""

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle notification</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="title">Titre</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="body">Message</Label>
            <Input id="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} />
          </div>
          <div>
            <Label>Cible</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les utilisateurs</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.firstName} {u.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant={!scheduled ? "primary" : "secondary"}
              onClick={() => setScheduled(false)}
              className="flex-1"
            >
              Maintenant
            </Button>
            <Button
              variant={scheduled ? "primary" : "secondary"}
              onClick={() => setScheduled(true)}
              className="flex-1"
            >
              Programmer
            </Button>
          </div>
          {scheduled && (
            <div>
              <Label htmlFor="scheduledAt">Date et heure d&apos;envoi</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Annuler</Button>
          </DialogClose>
          <Button
            disabled={!valid || (scheduled && !scheduledAt)}
            onClick={() => {
              onCreate({
                targetUserId: target === "all" ? null : Number(target),
                title,
                body,
                scheduledAt: scheduled ? new Date(scheduledAt) : undefined,
              })
              onOpenChange(false)
              reset()
            }}
          >
            {scheduled ? "Programmer" : "Envoyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
