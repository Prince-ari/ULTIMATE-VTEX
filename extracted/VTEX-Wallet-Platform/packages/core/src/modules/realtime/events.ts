import { EventEmitter } from "node:events"

export type RealtimeEvent = { type: "notification.created" | "document.assigned" | "transfer_proof.submitted"; targetUserId: number | null; payload: Record<string, unknown>; createdAt: string }

const bus = new EventEmitter()
bus.setMaxListeners(250)

export function publishRealtime(event: Omit<RealtimeEvent, "createdAt">) {
  bus.emit("event", { ...event, createdAt: new Date().toISOString() } satisfies RealtimeEvent)
}

export function subscribeRealtime(listener: (event: RealtimeEvent) => void) {
  bus.on("event", listener)
  return () => {
    bus.off("event", listener)
  }
}
