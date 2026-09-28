const baseUrl = (process.env.VTEX_VALIDATION_API_URL || "http://127.0.0.1:4000").replace(/\/$/, "")
const email = process.env.VTEX_INITIAL_ADMIN_EMAIL
const password = process.env.VTEX_INITIAL_ADMIN_PASSWORD
if (!email || !password) throw new Error("Identifiants administrateur absents.")

async function rpc(path, input, cookie, method = "POST") {
  const url = method === "GET" ? `${baseUrl}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : `${baseUrl}/api/trpc/${path}`
  const response = await fetch(url, {
    method,
    headers: { ...(method === "POST" ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    ...(method === "POST" ? { body: JSON.stringify({ json: input }) } : {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) throw new Error(payload?.error?.json?.message || `Échec ${path}.`)
  return payload?.result?.data?.json ?? payload
}

const login = await rpc("auth.login", { email, password })
const otp = await rpc("auth.devPeekOtp", { userId: login.userId }, undefined, "GET")
const verified = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: login.userId, code: otp.code, device: "VTEX savings integration validation" }) })
if (!verified.ok) throw new Error("Session de recette impossible.")
const header = typeof verified.headers.getSetCookie === "function" ? verified.headers.getSetCookie()[0] : verified.headers.get("set-cookie")
const cookie = header?.split(";")[0]
const wallet = await rpc("wallets.bootstrap", undefined, cookie)
const suffix = crypto.randomUUID().slice(0, 8)
const created = await rpc("savingsGoals.create", { walletAccountId: Number(wallet.account.id), name: `Recette épargne ${suffix}`, targetCents: 2_000, dueAt: "2030-01-01T00:00:00.000Z" }, cookie)
await rpc("savingsGoals.update", { goalId: Number(created.id), name: `Recette révisée ${suffix}`, targetCents: 3_000, dueAt: "2030-02-01T00:00:00.000Z" }, cookie)
await rpc("savingsGoals.fund", { goalId: Number(created.id), amountCents: 1_000, idempotencyKey: `savings-fund-${crypto.randomUUID()}` }, cookie)
await rpc("savingsGoals.close", { goalId: Number(created.id), idempotencyKey: `savings-close-${crypto.randomUUID()}` }, cookie)
const goals = await rpc("savingsGoals.listMine", undefined, cookie, "GET")
const closed = goals.find((goal) => Number(goal.id) === Number(created.id))
if (!closed || closed.status !== "archived" || closed.name !== `Recette révisée ${suffix}` || closed.targetCents !== 3_000) throw new Error("Cycle Savings Goals incomplet.")
console.log(JSON.stringify({ savingsGoalLifecycleValidated: true, goalId: created.id, archived: closed.status === "archived" }, null, 2))
