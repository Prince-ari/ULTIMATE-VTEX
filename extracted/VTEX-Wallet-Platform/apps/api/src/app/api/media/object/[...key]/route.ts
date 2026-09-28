import { createRequestContext } from "@vtex/core/src/api/context"
import { isAdminRole } from "@vtex/core/src/auth/permissions"
import { getPrivateObject } from "@vtex/core/src/modules/media/objectStorage"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const context = await createRequestContext(request)
  if (!context.actor) return new Response("Session requise.", { status: 401 })
  const key = (await params).key.join("/")
  const match = /^media\/users\/(\d+)\/avatar\//.exec(key)
  if (!match || (context.actor.id !== Number(match[1]) && !isAdminRole(context.actor.role) && context.actor.role !== "agent")) return new Response("Média introuvable.", { status: 404 })
  try {
    const object = await getPrivateObject(key)
    return new Response(object.bytes as unknown as BodyInit, { headers: { "Content-Type": object.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" } })
  } catch {
    return new Response("Média introuvable.", { status: 404 })
  }
}
