import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"

import { db } from "@vtex/core/src/db/client"
import { users } from "@vtex/core/src/db/schema"
import { hashPassword } from "@vtex/core/src/auth/password"
import { createSession } from "@vtex/core/src/auth/session"

import { GET, POST, OPTIONS } from "./route"

async function makeApiTestUser() {
  const email = `apiapp-${randomUUID().slice(0, 8)}@test.local`
  const [inserted] = await db.insert(users).values({
    firstName: "ApiApp",
    lastName: "Test",
    email,
    passwordHash: hashPassword("apiapppass123"),
    role: "user",
    status: "active",
    kycVerified: true,
  })
  return inserted.insertId
}

describe("apps/api — Route Handler fetch, en process réel", () => {
  it("GET public (settings.get) répond sans authentification", async () => {
    const req = new Request("http://x/api/trpc/settings.get")
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.data.json.platformName).toBe("VTEX")
  })

  it("GET authentifié (users.getMe) avec Bearer réel renvoie le bon utilisateur", async () => {
    const userId = await makeApiTestUser()
    const token = await createSession(db, userId)

    const req = new Request("http://x/api/trpc/users.getMe", {
      headers: { authorization: `Bearer ${token}` },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.data.json.id).toBe(userId)
  })

  it("sans Bearer, une procédure protégée renvoie 401", async () => {
    const req = new Request("http://x/api/trpc/users.getMe")
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("OPTIONS (preflight CORS) répond 204 avec les en-têtes nécessaires", async () => {
    const req = new Request("http://x/api/trpc/users.getMe", {
      method: "OPTIONS",
      headers: { origin: "https://admin.vtex.app" },
    })
    const res = await OPTIONS(req)
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-methods")).toContain("POST")
  })

  it("POST (mutation) fonctionne — login réel de bout en bout", async () => {
    const email = `apiapp-login-${randomUUID().slice(0, 8)}@test.local`
    await db.insert(users).values({
      firstName: "Login",
      lastName: "Test",
      email,
      passwordHash: hashPassword("loginpass123"),
      role: "user",
      status: "active",
      kycVerified: true,
    })

    const req = new Request("http://x/api/trpc/auth.login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { email, password: "loginpass123" } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.data.json.requiresOtp).toBe(true)
  })

  it("réponse GET publique porte les en-têtes CORS", async () => {
    const req = new Request("http://x/api/trpc/settings.get", {
      headers: { origin: "https://app.vtex.app" },
    })
    const res = await GET(req)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
  })
})
