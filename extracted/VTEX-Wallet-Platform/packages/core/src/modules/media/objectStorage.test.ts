import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  MAX_MEDIA_BYTES,
  adminUploadKey,
  assertAcceptedMedia,
  assertMediaSignature,
  assertPrivateObject,
  detectMediaType,
  getPrivateObject,
  putPrivateObject,
  safeFileName,
  sha256Hex,
  userUploadKey,
} from "./objectStorage"

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF")
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>")
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00])

describe("objectStorage — politique", () => {
  it("accepte les formats médias et la taille maximale explicitement autorisés", () => {
    expect(() => assertAcceptedMedia("releve-compte.pdf", "application/pdf", MAX_MEDIA_BYTES)).not.toThrow()
    expect(() => assertAcceptedMedia("preuve.png", "image/png", 1)).not.toThrow()
  })

  it("refuse les types, tailles et noms de fichiers hors politique", () => {
    expect(() => assertAcceptedMedia("preuve.exe", "application/octet-stream", 100)).toThrow("Format refusé")
    expect(() => assertAcceptedMedia("preuve.pdf", "application/pdf", MAX_MEDIA_BYTES + 1)).toThrow("trop volumineux")
    expect(() => assertAcceptedMedia("", "application/pdf", 100)).toThrow("Nom de fichier invalide")
  })

  it("isole les clés privées par acteur et par usage", () => {
    expect(userUploadKey(42, "avatar", "portrait", "image/webp")).toMatch(/^media\/users\/42\/avatar\/[\w-]+\.webp$/)
    expect(userUploadKey(42, "transfer-proof", "capture.png", "image/png")).toMatch(/^media\/users\/42\/transfer-proof\/[\w-]+\.png$/)
    expect(adminUploadKey(7, "document", "application/pdf")).toMatch(/^media\/admin\/7\/documents\/[\w-]+\.pdf$/)
  })
})

describe("objectStorage — contenu réel", () => {
  it("reconnaît PDF, JPEG, PNG et WebP par leur signature, pas par le nom ni le type annoncé", () => {
    expect(detectMediaType(PDF)).toBe("application/pdf")
    expect(detectMediaType(JPEG)).toBe("image/jpeg")
    expect(detectMediaType(PNG)).toBe("image/png")
    expect(detectMediaType(WEBP)).toBe("image/webp")
    expect(detectMediaType(HTML)).toBeNull()
    expect(detectMediaType(EXE)).toBeNull()
  })

  it("refuse un fichier déguisé : exécutable ou HTML annoncé en PDF, PDF annoncé en image", () => {
    expect(() => assertMediaSignature(PDF, "application/pdf")).not.toThrow()
    expect(() => assertMediaSignature(EXE, "application/pdf")).toThrow(/ne correspond pas/)
    expect(() => assertMediaSignature(HTML, "image/png")).toThrow(/ne correspond pas/)
    expect(() => assertMediaSignature(PDF, "image/png")).toThrow(/ne correspond pas/)
    expect(() => assertMediaSignature(new Uint8Array(), "application/pdf")).toThrow(/ne correspond pas/)
  })

  it("empreinte SHA-256 stable ; nom d'affichage sans chemin ni caractère de contrôle", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(safeFileName("..\\..\\windows\\relevé.pdf")).toBe("relevé.pdf")
    expect(safeFileName("/etc/passwd")).toBe("passwd")
    expect(safeFileName("nom\u0000\u0007<b>.pdf")).toBe("nomb.pdf")
    expect(safeFileName("   ")).toBe("")
    expect(safeFileName("x".repeat(400))).toHaveLength(180)
  })
})

describe("objectStorage — pilote local (développement et tests)", () => {
  let dir = ""
  const saved = { S3: process.env.VTEX_MEDIA_S3_ENDPOINT, LOCAL: process.env.VTEX_MEDIA_LOCAL_DIR }
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "vtex-media-test-"))
    delete process.env.VTEX_MEDIA_S3_ENDPOINT
    process.env.VTEX_MEDIA_LOCAL_DIR = dir
  })
  afterAll(() => {
    if (saved.S3 !== undefined) process.env.VTEX_MEDIA_S3_ENDPOINT = saved.S3
    if (saved.LOCAL === undefined) delete process.env.VTEX_MEDIA_LOCAL_DIR
    else process.env.VTEX_MEDIA_LOCAL_DIR = saved.LOCAL
    rmSync(dir, { recursive: true, force: true })
  })

  it("écrit, vérifie et relit un objet privé avec son type ; une clé n'est jamais écrasée", async () => {
    const key = adminUploadKey(9, "contrat.pdf", "application/pdf")
    await putPrivateObject(key, PDF, "application/pdf")
    await expect(assertPrivateObject(key)).resolves.toBeUndefined()
    const object = await getPrivateObject(key)
    expect(object.contentType).toBe("application/pdf")
    expect(Buffer.from(object.bytes).equals(Buffer.from(PDF))).toBe(true)
    await expect(putPrivateObject(key, PNG, "image/png")).rejects.toThrow()
    expect(Buffer.from((await getPrivateObject(key)).bytes).equals(Buffer.from(PDF))).toBe(true)
  })

  it("refuse toute clé qui tente de sortir du dossier privé ou qui n'est pas une clé média", async () => {
    for (const key of ["../../etc/passwd", "media/../../secret.pdf", "/etc/passwd", "media/a//b.pdf", "media/a/b", "media/a/..%2f/b.pdf", "media/a/b.pdf/../../c.pdf", "documents/x.pdf", "media/a b/c.pdf"]) {
      await expect(putPrivateObject(key, PDF, "application/pdf")).rejects.toThrow(/invalide/)
      await expect(getPrivateObject(key)).rejects.toThrow(/invalide/)
      await expect(assertPrivateObject(key)).rejects.toThrow(/invalide/)
    }
  })

  it("un objet absent est signalé sans révéler le chemin du serveur", async () => {
    const key = adminUploadKey(9, "absent.pdf", "application/pdf")
    await expect(assertPrivateObject(key)).rejects.toThrow("Objet média introuvable.")
    await expect(getPrivateObject(key)).rejects.toThrow("Objet média indisponible.")
  })
})
