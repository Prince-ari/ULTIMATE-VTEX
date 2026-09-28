import { z } from "zod"

/** Une photo externe doit être HTTPS. Une photo importée est servie via le chemin
 * authentifié interne, les octets ne quittent jamais le stockage objet privé. */
export const avatarUrlSchema = z.string().trim().max(500, "L’URL de la photo est trop longue.").refine((value) => {
  if (value.startsWith("/api/media/object/media/users/")) return true
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}, "La photo doit utiliser HTTPS ou le chemin média interne sécurisé.")

export const avatarUrlPatchSchema = avatarUrlSchema.nullable().optional()
