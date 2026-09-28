import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { createServer } from "./server"
import { coreRouter } from "./router"

const PORT = 4199
let server: ReturnType<typeof createServer>

beforeAll(() => {
  server = createServer(PORT, coreRouter)
})

afterAll(() => {
  server.close()
})

afterEach(() => {
  delete process.env.ALLOWED_ORIGINS
})

/**
 * CORS trouvé absent lors de l'audit de déploiement — invisible dans tous
 * les tests précédents car ni @trpc/client (Node) ni les appels
 * serveur-à-serveur ne sont soumis à cette restriction, propre aux
 * navigateurs. Ces tests envoient l'en-tête `Origin` explicitement,
 * comme un vrai navigateur le ferait, pour vérifier le comportement réel.
 */
describe("CORS", () => {
  it("sans ALLOWED_ORIGINS configuré, autorise toute origine (dev)", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/settings.get`, {
      headers: { Origin: "https://n-importe-quoi.example.com" },
    })
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
  })

  it("avec ALLOWED_ORIGINS configuré, une origine autorisée est reflétée", async () => {
    process.env.ALLOWED_ORIGINS = "https://admin.vtex.app,https://app.vtex.app"
    const res = await fetch(`http://127.0.0.1:${PORT}/settings.get`, {
      headers: { Origin: "https://admin.vtex.app" },
    })
    expect(res.headers.get("access-control-allow-origin")).toBe("https://admin.vtex.app")
  })

  it("avec ALLOWED_ORIGINS configuré, une origine NON listée ne reçoit aucun en-tête (le navigateur bloquera)", async () => {
    process.env.ALLOWED_ORIGINS = "https://admin.vtex.app"
    const res = await fetch(`http://127.0.0.1:${PORT}/settings.get`, {
      headers: { Origin: "https://malveillant.example.com" },
    })
    expect(res.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("une requête preflight OPTIONS répond 204 avec les en-têtes nécessaires à un appel authentifié", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/users.list`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://admin.vtex.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-methods")).toContain("POST")
    expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("authorization")
  })
})
