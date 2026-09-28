import { createRequestContext } from "@vtex/core/src/api/context"
// Même point d'entrée que les services : le contexte d'audit (rôle, session, IP) n'est retrouvé par `logAction` que si c'est la MÊME instance de module.
import { db, getPrivateObject, resolveDownload, runWithRequestContext, toRequestContext } from "@vtex/core"

export const runtime = "nodejs"

function downloadName(name: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** En-têtes d'un document servi : jamais interprété par le navigateur, jamais mis en cache, jamais rendu dans une page. */
function documentHeaders(contentType: string, fileName: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": downloadName(fileName),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await createRequestContext(request)
  if (!context.actor) return new Response("Session requise.", { status: 401 })
  if (context.actor.mustChangePassword) return new Response("Remplacez votre mot de passe temporaire pour continuer.", { status: 403 })
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return new Response("Document introuvable.", { status: 404 })
  const actor = context.actor
  try {
    // Droit, périmètre (destinataire actif, personnel autorisé, portefeuille du gestionnaire) et journal d'accès : tout est dans `resolveDownload`.
    const document = await runWithRequestContext(toRequestContext(context), () => resolveDownload(db, actor, id))
    if (document.storageKey) {
      const object = await getPrivateObject(document.storageKey)
      // Le type servi est celui vérifié à l'envoi (enregistré avec le document), pas celui que le stockage renvoie.
      return new Response(object.bytes as unknown as BodyInit, { headers: documentHeaders(document.mimeType, document.fileName) })
    }
    return new Response(document.content ?? "", { headers: documentHeaders(document.mimeType, document.fileName) })
  } catch {
    return new Response("Document introuvable.", { status: 404 })
  }
}
