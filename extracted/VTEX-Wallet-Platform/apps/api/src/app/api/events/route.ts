import { createRequestContext } from "@vtex/core/src/api/context"
import { isAdminRole, type Role } from "@vtex/core/src/auth/permissions"
import { subscribeRealtime, type RealtimeEvent } from "@vtex/core/src/modules/realtime/events"

export const runtime = "nodejs"

/** Supervision : administrateurs et support voient tous les événements ; les autres, uniquement les leurs. */
function canReceive(event: RealtimeEvent, actor: { id: number; role: Role }) {
  const supervisor = isAdminRole(actor.role) || actor.role === "agent"
  if (event.type === "transfer_proof.submitted") return supervisor
  return event.targetUserId === null || event.targetUserId === actor.id || supervisor
}

export async function GET(request: Request) {
  const context = await createRequestContext(request)
  if (!context.actor) return new Response("Session requise.", { status: 401 })
  const encoder = new TextEncoder()
  let stop: () => void = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`))
      stop = subscribeRealtime((event) => {
        if (canReceive(event, context.actor!)) controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))
      })
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), 25_000)
    },
    cancel() {
      stop()
      if (heartbeat) clearInterval(heartbeat)
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" } })
}
