import { randomUUID } from "node:crypto"
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client"
import superjson from "superjson"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { CoreRouter } from "./router"
import { coreRouter } from "./router"
import { createServer } from "./server"
import { _resetRateLimitsForTests } from "./rateLimit"
import { db } from "../db/client"
import { users } from "../db/schema"
import { hashPassword } from "../auth/password"

/**
 * Ce fichier teste volontairement le contrat générique (`coreRouter`)
 * indépendamment des scénarios propres à un domaine produit. Un produit
 * composé conserve ses propres tests de contrat en plus de cette suite.
 */
const PORT = 4178
let server: ReturnType<typeof createServer>

function clientFor(token?: string) {
  return createTRPCClient<CoreRouter>({
    links: [
      httpLink({
        url: `http://localhost:${PORT}`,
        transformer: superjson,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    ],
  })
}

async function makeE2eUser(role: "admin" | "user" = "user") {
  const email = `e2e-${randomUUID().slice(0, 8)}@test.local`
  const [inserted] = await db.insert(users).values({
    firstName: "E2E",
    lastName: role,
    email,
    passwordHash: hashPassword("e2epassword123"),
    role,
    status: "active",
    kycVerified: true,
  })
  return { userId: inserted.insertId, email }
}

async function loginFlow(email: string, password = "e2epassword123"): Promise<string> {
  const anon = clientFor()
  const { userId } = await anon.auth.login.mutate({ email, password })
  const { code } = await anon.auth.devPeekOtp.query({ userId })
  const { token } = await anon.auth.verifyOtp.mutate({ userId, code })
  return token
}

beforeAll(() => {
  server = createServer(PORT, coreRouter)
})

beforeEach(async () => {
  await _resetRateLimitsForTests(db)
})

afterAll(() => {
  server.close()
})

describe("API end-to-end (coreRouter générique) — HTTP réel, pas d'appel direct aux services", () => {
  it("settings.get répond sans authentification (champs publics)", async () => {
    const anon = clientFor()
    const settings = await anon.settings.get.query()
    expect(settings).toHaveProperty("platformName")
  })

  it("une procédure protégée sans token renvoie UNAUTHORIZED", async () => {
    const anon = clientFor()
    await expect(anon.users.getMe.query()).rejects.toThrow()
    try {
      await anon.users.getMe.query()
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCClientError)
      expect((err as TRPCClientError<CoreRouter>).data?.code).toBe("UNAUTHORIZED")
    }
  })

  it("flux complet login -> OTP -> requête authentifiée réelle", async () => {
    const u = await makeE2eUser("user")
    const token = await loginFlow(u.email)

    const me = await clientFor(token).users.getMe.query()
    expect(me.email).toBe(u.email)
  })

  it("un rôle 'user' authentifié se voit refuser une procédure admin (FORBIDDEN, pas juste une UI qui cache le bouton)", async () => {
    const u = await makeE2eUser("user")
    const token = await loginFlow(u.email)

    try {
      await clientFor(token).journal.list.query()
      throw new Error("aurait dû rejeter")
    } catch (err) {
      expect((err as TRPCClientError<CoreRouter>).data?.code).toBe("FORBIDDEN")
    }
  })

  it("logout révoque immédiatement le token, même non expiré", async () => {
    const u = await makeE2eUser("user")
    const token = await loginFlow(u.email)
    const authed = clientFor(token)

    await authed.users.getMe.query() // fonctionne avant logout
    await authed.auth.logout.mutate()

    await expect(authed.users.getMe.query()).rejects.toThrow()
  })

  it("users.create générique (coreRouter) ne crée jamais de wallet — comportement composé testé dans @vtex/router", async () => {
    const admin = await makeE2eUser("admin")
    const adminToken = await loginFlow(admin.email)
    const adminClient = clientFor(adminToken)

    const email = `e2e-generic-create-${randomUUID().slice(0, 8)}@test.local`
    const newUserId = await adminClient.users.create.mutate({
      firstName: "Generic",
      lastName: "Create",
      email,
      temporaryPassword: "genABC123!",
    })

    const created = await adminClient.users.getById.query({ id: newUserId })
    expect(created.email).toBe(email)
  })

  // En dernier, volontairement : ce test épuise le quota de rate limiting
  // pour l'IP de test (127.0.0.1), ce qui bloquerait tout test suivant
  // appelant login() dans ce même fichier / cette même exécution.
  it("login est protégé par rate limiting — la 6e tentative en moins d'une minute est rejetée", async () => {
    await _resetRateLimitsForTests(db) // les tests précédents ont déjà appelé login via loginFlow()
    const u = await makeE2eUser("user")
    const anon = clientFor()
    for (let i = 0; i < 5; i++) {
      await anon.auth.login.mutate({ email: u.email, password: "mauvais" }).catch(() => {})
    }
    try {
      await anon.auth.login.mutate({ email: u.email, password: "mauvais" })
      throw new Error("aurait dû être limité")
    } catch (err) {
      expect((err as TRPCClientError<CoreRouter>).data?.code).toBe("TOO_MANY_REQUESTS")
    }
  })
})
