import { z } from "zod"

/** Photo de profil : uniquement une image réellement importée par le titulaire (chemin média interne authentifié,
 * les octets ne quittent jamais le stockage objet privé). Aucune URL externe arbitraire n'est acceptée : ni
 * hotlinking d'image tierce, ni vecteur pour faire charger une ressource externe au nom d'un titulaire. */
export const avatarUrlSchema = z.string().trim().max(500, "L’URL de la photo est trop longue.").refine(
  (value) => value.startsWith("/api/media/object/media/users/"),
  "La photo doit provenir d’un import (chemin média interne) — aucune URL externe n’est acceptée.",
)

export const avatarUrlPatchSchema = avatarUrlSchema.nullable().optional()
