import { assertProductionEnv } from "@vtex/core/src/env"
import { createRequestContext } from "@vtex/core/src/api/context"
// Tout vient du même point d'entrée (`@vtex/core`) : les classes d'erreur et le contexte d'audit doivent être LES MÊMES instances que celles des services,
// sinon `instanceof ValidationError` échoue (réponse 500 au lieu de 400) et `logAction` ne retrouve pas le rôle de l'acteur.
import { ForbiddenError, RateLimitError, ValidationError, adminUploadKey, assertAcceptedMedia, assertMediaSignature, can, checkRateLimit, db, logAction, putPrivateObject, runWithRequestContext, safeFileName, toRequestContext, userUploadKey } from "@vtex/core"

export const runtime = "nodejs"

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  try {
    assertProductionEnv()
    const context = await createRequestContext(request)
    const actor = context.actor
    if (!actor) return json({ error: "Session requise." }, 401)
    if (actor.mustChangePassword) return json({ error: "Remplacez votre mot de passe temporaire pour continuer." }, 403)

    // Le journal d'audit lit rôle, session et IP dans le contexte de la requête.
    return await runWithRequestContext(toRequestContext(context), async () => {
      await checkRateLimit(db, `media:upload:${actor.id}`, 20, 60_000)
      const data = await request.formData()
      const file = data.get("file")
      const purpose = data.get("purpose")
      if (!(file instanceof File) || typeof purpose !== "string") throw new ValidationError("Fichier ou usage média invalide.")
      const fileName = safeFileName(file.name)
      assertAcceptedMedia(fileName, file.type, file.size)

      let storageKey: string
      if (purpose === "avatar") {
        if (!file.type.startsWith("image/")) throw new ValidationError("La photo de profil doit être une image.")
        storageKey = userUploadKey(actor.id, "avatar", fileName, file.type)
      } else if (purpose === "transfer-proof") {
        storageKey = userUploadKey(actor.id, "transfer-proof", fileName, file.type)
      } else if (purpose === "admin-document") {
        // Permission, pas rôle : ADMIN, SUPER_ADMIN et GESTIONNAIRE DE COMPTE envoient des documents (le périmètre est vérifié à l'envoi).
        if (!can(actor, "documents.send")) throw new ForbiddenError("Permission requise : documents.send.")
        storageKey = adminUploadKey(actor.id, fileName, file.type)
      } else {
        throw new ValidationError("Usage média inconnu.")
      }

      // Le contenu doit être ce qu'il prétend : jamais un HTML, un script ou un exécutable renommé.
      const bytes = new Uint8Array(await file.arrayBuffer())
      assertMediaSignature(bytes, file.type)

      await putPrivateObject(storageKey, bytes, file.type)
      await logAction(db, actor.id, "media.upload", "media_upload", actor.id, { purpose, storageKey, fileName, mimeType: file.type, sizeBytes: file.size })
      return json({ storageKey, fileName, mimeType: file.type, sizeBytes: file.size, url: purpose === "avatar" ? `/api/media/object/${storageKey}` : null }, 201)
    })
  } catch (error) {
    if (error instanceof ValidationError) return json({ error: error.message }, 400)
    if (error instanceof ForbiddenError) return json({ error: error.message }, 403)
    if (error instanceof RateLimitError) return json({ error: error.message }, 429)
    return json({ error: "Import média impossible." }, 500)
  }
}
