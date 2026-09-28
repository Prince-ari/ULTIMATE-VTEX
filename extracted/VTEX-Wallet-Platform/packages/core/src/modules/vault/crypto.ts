import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto"

/**
 * Chiffrement des données sensibles au repos (numéro de carte, CVV, PIN…).
 *
 *  - AES-256-GCM : confidentialité + intégrité. Le contexte (`aad`) est authentifié : un chiffré copié d'une ligne/colonne vers
 *    une autre échoue au déchiffrement (impossible d'échanger deux cartes en base).
 *  - Clés dans l'environnement, jamais en base : `VTEX_VAULT_KEYS="v2:<base64 32 octets>,v1:<base64 32 octets>"` et
 *    `VTEX_VAULT_ACTIVE_KEY="v2"`. Les anciennes clés restent lisibles pour la rotation ; seule la clé active chiffre.
 *    Raccourci : `VTEX_VAULT_KEY="<base64 32 octets>"` (identifiant `v1`).
 *  - Production sans clé : le coffre est INDISPONIBLE (échec fermé). Hors production, une clé de développement est dérivée de
 *    JWT_SECRET (HKDF) pour que le poste local fonctionne sans configuration — elle ne protège rien d'autre qu'une base locale.
 *
 * Format d'un champ chiffré : `<keyId>.<base64url(iv ‖ tag ‖ chiffré)>`.
 */

export class VaultUnavailableError extends Error {
  constructor(message = "Le coffre de données sensibles n'est pas configuré (VTEX_VAULT_KEYS).") {
    super(message)
    this.name = "VaultUnavailableError"
  }
}

export class VaultIntegrityError extends Error {
  constructor(message = "Donnée du coffre illisible : clé inconnue ou contenu altéré.") {
    super(message)
    this.name = "VaultIntegrityError"
  }
}

interface VaultKeyring {
  activeId: string
  keys: Map<string, Buffer>
}

const KEY_ID = /^[A-Za-z0-9_-]{1,16}$/

function decodeKey(id: string, encoded: string): Buffer {
  if (!KEY_ID.test(id)) throw new VaultUnavailableError(`Identifiant de clé du coffre invalide : « ${id} ».`)
  const key = Buffer.from(encoded.trim(), "base64")
  if (key.length !== 32) throw new VaultUnavailableError(`La clé « ${id} » du coffre doit faire exactement 32 octets (base64).`)
  return key
}

function loadKeyring(): VaultKeyring {
  const keys = new Map<string, Buffer>()
  const list = process.env.VTEX_VAULT_KEYS?.trim()
  const single = process.env.VTEX_VAULT_KEY?.trim()

  if (list) {
    for (const item of list.split(",").map((part) => part.trim()).filter(Boolean)) {
      const separator = item.indexOf(":")
      if (separator < 1) throw new VaultUnavailableError("VTEX_VAULT_KEYS doit avoir la forme « id:base64,id2:base64 ».")
      keys.set(item.slice(0, separator), decodeKey(item.slice(0, separator), item.slice(separator + 1)))
    }
  } else if (single) {
    keys.set("v1", decodeKey("v1", single))
  }

  if (keys.size === 0) {
    const secret = process.env.JWT_SECRET
    if (process.env.NODE_ENV === "production" || !secret) throw new VaultUnavailableError()
    // Développement uniquement : clé dérivée, déterministe, jamais utilisée si une vraie clé est configurée.
    keys.set("dev", Buffer.from(hkdfSync("sha256", secret, "vtex-vault-dev", "card-vault-dev-key", 32)))
  }

  const activeId = process.env.VTEX_VAULT_ACTIVE_KEY?.trim() || [...keys.keys()][0]!
  if (!keys.has(activeId)) throw new VaultUnavailableError(`La clé active « ${activeId} » n'est pas dans VTEX_VAULT_KEYS.`)
  return { activeId, keys }
}

/** Identifiant de la clé qui chiffre aujourd'hui (sert à repérer les lignes à re-chiffrer après une rotation). */
export function activeVaultKeyId(): string {
  return loadKeyring().activeId
}

export function encryptSecret(plaintext: string, aad: string): { keyId: string; blob: string } {
  const { activeId, keys } = loadKeyring()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keys.get(activeId)!, iv)
  cipher.setAAD(Buffer.from(aad, "utf8"))
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return { keyId: activeId, blob: `${activeId}.${Buffer.concat([iv, tag, encrypted]).toString("base64url")}` }
}

export function decryptSecret(blob: string, aad: string): string {
  const { keys } = loadKeyring()
  const separator = blob.indexOf(".")
  if (separator < 1) throw new VaultIntegrityError()
  const key = keys.get(blob.slice(0, separator))
  if (!key) throw new VaultIntegrityError(`Clé « ${blob.slice(0, separator)} » absente de la configuration du coffre.`)
  const raw = Buffer.from(blob.slice(separator + 1), "base64url")
  if (raw.length < 12 + 16 + 1) throw new VaultIntegrityError()
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
    decipher.setAAD(Buffer.from(aad, "utf8"))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
  } catch {
    throw new VaultIntegrityError()
  }
}

/**
 * Index aveugle : empreinte HMAC déterministe qui permet de dédoublonner / retrouver une valeur sans la déchiffrer.
 * Elle ne doit PAS changer quand on fait tourner la clé de chiffrement : clé d'index dédiée (`VTEX_VAULT_INDEX_KEY`, base64 32 octets) ;
 * à défaut, la clé de plus petit identifiant du trousseau (l'ancienne clé — gardez-la dans `VTEX_VAULT_KEYS` après une rotation).
 * Sous-clé HKDF par usage : aucune clé ne sert directement de clé d'index.
 */
export function blindIndex(value: string, purpose: string): string {
  const { keys } = loadKeyring()
  const dedicated = process.env.VTEX_VAULT_INDEX_KEY?.trim()
  const root = dedicated ? decodeKey("index", dedicated) : keys.get([...keys.keys()].sort()[0]!)!
  const subkey = Buffer.from(hkdfSync("sha256", root, "vtex-vault-blind-index", purpose, 32))
  return createHmac("sha256", subkey).update(value).digest("hex")
}
