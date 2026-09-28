import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  class ValidationError extends Error {}
  class ForbiddenError extends Error {}
  class RateLimitError extends Error {}
  return {
    ValidationError,
    ForbiddenError,
    RateLimitError,
    actor: { id: 42, role: "user" } as Record<string, unknown>,
    assertProductionEnv: vi.fn(),
    createRequestContext: vi.fn(),
    assertAcceptedMedia: vi.fn(),
    assertMediaSignature: vi.fn(),
    putPrivateObject: vi.fn(),
    userUploadKey: vi.fn(),
    adminUploadKey: vi.fn(),
    logAction: vi.fn(),
    can: vi.fn(),
    checkRateLimit: vi.fn(),
  }
})

vi.mock("@vtex/core/src/env", () => ({ assertProductionEnv: mocks.assertProductionEnv }))
vi.mock("@vtex/core/src/api/context", () => ({ createRequestContext: mocks.createRequestContext }))
// Un seul point d'entrée « @vtex/core » : la route en tire les erreurs, le stockage et le contexte d'audit (mêmes instances que les services).
vi.mock("@vtex/core", () => ({
  ValidationError: mocks.ValidationError,
  ForbiddenError: mocks.ForbiddenError,
  RateLimitError: mocks.RateLimitError,
  logAction: mocks.logAction,
  can: mocks.can,
  checkRateLimit: mocks.checkRateLimit,
  runWithRequestContext: (_context: unknown, run: () => Promise<unknown>) => run(),
  toRequestContext: (context: unknown) => context,
  adminUploadKey: mocks.adminUploadKey,
  assertAcceptedMedia: mocks.assertAcceptedMedia,
  assertMediaSignature: mocks.assertMediaSignature,
  putPrivateObject: mocks.putPrivateObject,
  safeFileName: (name: string) => name.split(/[\\/]/).pop() ?? "",
  userUploadKey: mocks.userUploadKey,
  db: {},
}))

import { POST } from "./route"

function uploadRequest(purpose: string, file: File) {
  const form = new FormData()
  form.set("purpose", purpose)
  form.set("file", file)
  return new Request("http://localhost/api/media/upload", { method: "POST", body: form })
}

describe("POST /api/media/upload", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.actor = { id: 42, role: "user" }
    mocks.createRequestContext.mockImplementation(async () => ({ actor: mocks.actor }))
    mocks.userUploadKey.mockReturnValue("media/users/42/avatar/profile.webp")
    mocks.putPrivateObject.mockResolvedValue("media/users/42/avatar/profile.webp")
    mocks.adminUploadKey.mockReturnValue("media/admin/42/documents/releve.pdf")
    mocks.can.mockReturnValue(false)
  })

  it("importe un avatar privé et ne retourne qu’une URL interne contrôlée", async () => {
    const response = await POST(uploadRequest("avatar", new File(["avatar"], "profile.webp", { type: "image/webp" })))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      storageKey: "media/users/42/avatar/profile.webp",
      url: "/api/media/object/media/users/42/avatar/profile.webp",
      mimeType: "image/webp",
    }))
    expect(mocks.putPrivateObject).toHaveBeenCalledWith("media/users/42/avatar/profile.webp", expect.any(Uint8Array), "image/webp")
    expect(mocks.assertMediaSignature).toHaveBeenCalledWith(expect.any(Uint8Array), "image/webp")
    expect(mocks.logAction).toHaveBeenCalledWith(expect.anything(), 42, "media.upload", "media_upload", 42, expect.objectContaining({ purpose: "avatar" }))
  })

  it("retourne une erreur métier sans stocker le fichier lorsqu’un format est refusé", async () => {
    mocks.assertAcceptedMedia.mockImplementation(() => { throw new mocks.ValidationError("Format refusé") })

    const response = await POST(uploadRequest("avatar", new File(["binary"], "profile.exe", { type: "application/octet-stream" })))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Format refusé" })
    expect(mocks.putPrivateObject).not.toHaveBeenCalled()
  })

  it("refuse un contenu qui ne correspond pas à son type, sans rien stocker ni journaliser", async () => {
    mocks.assertMediaSignature.mockImplementation(() => { throw new mocks.ValidationError("Le contenu du fichier ne correspond pas à son type.") })

    const response = await POST(uploadRequest("transfer-proof", new File(["<html>"], "preuve.pdf", { type: "application/pdf" })))

    expect(response.status).toBe(400)
    expect(mocks.putPrivateObject).not.toHaveBeenCalled()
    expect(mocks.logAction).not.toHaveBeenCalled()
  })

  it("« admin-document » exige la permission documents.send (gestionnaires inclus) et accepte PDF et images", async () => {
    const pdf = new File(["%PDF-1.4"], "releve.pdf", { type: "application/pdf" })

    const denied = await POST(uploadRequest("admin-document", pdf))
    expect(denied.status).toBe(403)
    expect(mocks.putPrivateObject).not.toHaveBeenCalled()

    mocks.actor = { id: 42, role: "account_manager" }
    mocks.can.mockImplementation((_actor: unknown, permission: string) => permission === "documents.send")
    const allowed = await POST(uploadRequest("admin-document", pdf))
    expect(allowed.status).toBe(201)
    await expect(allowed.json()).resolves.toMatchObject({ storageKey: "media/admin/42/documents/releve.pdf", url: null })
    expect(mocks.can).toHaveBeenCalledWith(expect.objectContaining({ role: "account_manager" }), "documents.send")

    const scan = await POST(uploadRequest("admin-document", new File(["png"], "scan.png", { type: "image/png" })))
    expect(scan.status).toBe(201)
  })

  it("répond 401 sans session, 403 tant que le mot de passe temporaire n'est pas remplacé, 429 au-delà de la limite, 400 pour un usage inconnu", async () => {
    mocks.createRequestContext.mockResolvedValueOnce({ actor: null })
    expect((await POST(uploadRequest("avatar", new File(["x"], "a.png", { type: "image/png" })))).status).toBe(401)

    mocks.actor = { id: 42, role: "user", mustChangePassword: true }
    expect((await POST(uploadRequest("avatar", new File(["x"], "a.png", { type: "image/png" })))).status).toBe(403)

    mocks.actor = { id: 42, role: "user" }
    mocks.checkRateLimit.mockRejectedValueOnce(new mocks.RateLimitError("Trop d'imports, réessayez dans une minute."))
    const limited = await POST(uploadRequest("avatar", new File(["x"], "a.png", { type: "image/png" })))
    expect(limited.status).toBe(429)
    expect(mocks.putPrivateObject).not.toHaveBeenCalled()

    expect((await POST(uploadRequest("secret", new File(["x"], "a.png", { type: "image/png" })))).status).toBe(400)
  })
})
