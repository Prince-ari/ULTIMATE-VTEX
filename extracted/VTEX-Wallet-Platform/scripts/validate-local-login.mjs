const apiBaseUrl = (process.env.VTEX_VALIDATION_API_URL || "http://127.0.0.1:4000").replace(/\/$/, "")
const email = process.env.VTEX_INITIAL_ADMIN_EMAIL
const password = process.env.VTEX_INITIAL_ADMIN_PASSWORD

if (!email || !password) throw new Error("VTEX_INITIAL_ADMIN_EMAIL et VTEX_INITIAL_ADMIN_PASSWORD sont requis.")

async function callTrpc(path, input, cookie) {
  const response = await fetch(`${apiBaseUrl}/api/trpc/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ json: input }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) {
    throw new Error(payload?.error?.json?.message || payload?.error?.message || `Échec tRPC ${path} (${response.status})`)
  }
  return payload?.result?.data?.json ?? payload
}

async function queryTrpc(path, input, cookie) {
  const response = await fetch(`${apiBaseUrl}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, {
    headers: cookie ? { cookie } : {},
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) {
    throw new Error(payload?.error?.json?.message || payload?.error?.message || `Échec tRPC ${path} (${response.status})`)
  }
  return payload?.result?.data?.json ?? payload
}

const login = await callTrpc("auth.login", { email, password })
const otp = await queryTrpc("auth.devPeekOtp", { userId: login.userId })
const verification = await fetch(`${apiBaseUrl}/api/auth/verify-otp`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: login.userId, code: otp.code, device: "VTEX local integration validation" }),
})
const verificationPayload = await verification.json().catch(() => ({}))
if (!verification.ok) throw new Error(verificationPayload.error || "Le pont HTTP OTP a échoué.")

const setCookie = typeof verification.headers.getSetCookie === "function"
  ? verification.headers.getSetCookie()[0]
  : verification.headers.get("set-cookie")
const cookie = setCookie?.split(";")[0]
if (!cookie?.startsWith("vtex_session=")) throw new Error("Le cookie HttpOnly vtex_session n’a pas été posé.")

const profile = await queryTrpc("users.getMe", undefined, cookie)
if (profile.email !== email.toLowerCase() || profile.role !== "admin") throw new Error("Le profil connecté n’a pas le rôle administrateur attendu.")

const wallet = await callTrpc("wallets.bootstrap", undefined, cookie)
if (!wallet.account?.id || !Array.isArray(wallet.cards) || !Array.isArray(wallet.transactions)) {
  throw new Error("Le bootstrap Wallet n’a pas provisionné la structure attendue.")
}

console.log(JSON.stringify({
  authenticated: true,
  httpOnlySessionCookie: true,
  role: profile.role,
  walletAccountId: wallet.account.id,
  virtualCardProvisioned: wallet.cards.length > 0,
}, null, 2))
