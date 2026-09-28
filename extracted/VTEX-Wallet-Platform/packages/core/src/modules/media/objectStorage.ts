import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"

import { ValidationError } from "../../auth/permissions"

export const MAX_MEDIA_BYTES = 8 * 1024 * 1024
export const MEDIA_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"])

/**
 * Stockage privé des médias (documents, justificatifs, avatars). Aucune URL publique permanente : tout accès passe par une route authentifiée.
 *
 *  - Production et recette : S3 / MinIO (`VTEX_MEDIA_S3_*`), obligatoire — sans configuration le stockage refuse de servir (jamais de repli silencieux).
 *  - Développement local et tests : sans variables S3 et hors production, les objets vont dans un dossier privé du disque
 *    (`VTEX_MEDIA_LOCAL_DIR`, défaut `<répertoire courant>/.data/media`). Ce dossier n'est servi par aucune route statique.
 */

function s3Config() {
  const endpoint = process.env.VTEX_MEDIA_S3_ENDPOINT
  const accessKeyId = process.env.VTEX_MEDIA_S3_ACCESS_KEY
  const secretAccessKey = process.env.VTEX_MEDIA_S3_SECRET_KEY
  const bucket = process.env.VTEX_MEDIA_S3_BUCKET
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null
  return { endpoint, accessKeyId, secretAccessKey, bucket }
}

type Driver = { kind: "s3"; bucket: string; s3: S3Client } | { kind: "local"; root: string }

function driver(): Driver {
  const config = s3Config()
  if (config) return { kind: "s3", bucket: config.bucket, s3: new S3Client({ endpoint: config.endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }) }
  if (process.env.NODE_ENV === "production") throw new ValidationError("Le stockage média n’est pas encore configuré par l’administrateur.")
  return { kind: "local", root: resolve(process.env.VTEX_MEDIA_LOCAL_DIR ?? join(process.cwd(), ".data", "media")) }
}

/** Clé d'objet sûre : segments alphanumériques, jamais de remontée de dossier ni de chemin absolu. */
const KEY_PATTERN = /^media\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_-]+\.[a-z0-9]{1,8}$/

function assertKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.length > 512) throw new ValidationError("Clé d’objet média invalide.")
}

function localPath(root: string, key: string): string {
  assertKey(key)
  const full = resolve(root, key)
  if (!full.startsWith(root + sep)) throw new ValidationError("Clé d’objet média invalide.")
  return full
}

export function assertAcceptedMedia(fileName: string, mimeType: string, sizeBytes: number) {
  if (!MEDIA_MIME_TYPES.has(mimeType)) throw new ValidationError("Format refusé. Seuls PDF, JPEG, PNG et WebP sont acceptés.")
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_MEDIA_BYTES) throw new ValidationError("Fichier invalide ou trop volumineux (8 Mo maximum).")
  if (!fileName.trim() || fileName.length > 180) throw new ValidationError("Nom de fichier invalide.")
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value)

/** Le contenu réel correspond-il au type annoncé ? Un fichier déguisé (exécutable renommé en .pdf, HTML annoncé en image…) est refusé. */
export function detectMediaType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf" // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp" // RIFF....WEBP
  return null
}

export function assertMediaSignature(bytes: Uint8Array, declaredMimeType: string) {
  const detected = detectMediaType(bytes)
  if (!detected || detected !== declaredMimeType) throw new ValidationError("Le contenu du fichier ne correspond pas à son type. Importez un vrai PDF, JPEG, PNG ou WebP.")
}

/** Empreinte SHA-256 (hexadécimale) du contenu : identifie le fichier sans jamais l'exposer. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/** Nom d'affichage sûr : sans chemin, sans caractère de contrôle, borné. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ""
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim()
  return cleaned.slice(0, 180)
}

function extension(fileName: string, mimeType: string) {
  const dot = fileName.lastIndexOf(".")
  const candidate = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : undefined
  if (candidate && /^[a-z0-9]{1,8}$/.test(candidate)) return candidate
  return mimeType === "application/pdf" ? "pdf" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg"
}

export function userUploadKey(userId: number, kind: "avatar" | "transfer-proof", fileName: string, mimeType: string) {
  return `media/users/${userId}/${kind}/${randomUUID()}.${extension(fileName, mimeType)}`
}

export function adminUploadKey(actorId: number, fileName: string, mimeType: string) {
  return `media/admin/${actorId}/documents/${randomUUID()}.${extension(fileName, mimeType)}`
}

export async function putPrivateObject(key: string, bytes: Uint8Array, mimeType: string) {
  const active = driver()
  if (active.kind === "s3") {
    assertKey(key)
    await active.s3.send(new PutObjectCommand({ Bucket: active.bucket, Key: key, Body: bytes, ContentType: mimeType, CacheControl: "private, no-store" }))
    return key
  }
  const path = localPath(active.root, key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes, { flag: "wx" }) // jamais d'écrasement : une clé est écrite une seule fois
  await writeFile(`${path}.meta`, JSON.stringify({ contentType: mimeType }), { flag: "wx" })
  return key
}

export async function assertPrivateObject(key: string) {
  const active = driver()
  if (active.kind === "s3") {
    assertKey(key)
    await active.s3.send(new HeadObjectCommand({ Bucket: active.bucket, Key: key }))
    return
  }
  try { await stat(localPath(active.root, key)) } catch (error) {
    if (error instanceof ValidationError) throw error
    throw new ValidationError("Objet média introuvable.")
  }
}

export async function getPrivateObject(key: string) {
  const active = driver()
  if (active.kind === "s3") {
    assertKey(key)
    const object = await active.s3.send(new GetObjectCommand({ Bucket: active.bucket, Key: key }))
    if (!object.Body) throw new ValidationError("Objet média indisponible.")
    return { bytes: await object.Body.transformToByteArray(), contentType: object.ContentType ?? "application/octet-stream" }
  }
  const path = localPath(active.root, key)
  try {
    const bytes = new Uint8Array(await readFile(path))
    let contentType = "application/octet-stream"
    try { contentType = (JSON.parse(await readFile(`${path}.meta`, "utf8")) as { contentType?: string }).contentType ?? contentType } catch { /* type inconnu : téléchargement générique */ }
    return { bytes, contentType }
  } catch {
    throw new ValidationError("Objet média indisponible.")
  }
}
