const apiBaseUrl = (process.env.VTEX_VALIDATION_API_URL || "http://127.0.0.1:4000").replace(/\/$/, "")
const email = process.env.VTEX_INITIAL_ADMIN_EMAIL
const password = process.env.VTEX_INITIAL_ADMIN_PASSWORD

if (!email || !password) throw new Error("VTEX_INITIAL_ADMIN_EMAIL et VTEX_INITIAL_ADMIN_PASSWORD sont requis.")

async function mutation(path, input, cookie) {
  const response = await fetch(`${apiBaseUrl}/api/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ json: input }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) throw new Error(payload?.error?.json?.message || `Échec ${path}.`)
  return payload?.result?.data?.json ?? payload
}

async function query(path, input, cookie) {
  const response = await fetch(`${apiBaseUrl}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { headers: cookie ? { cookie } : {} })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) throw new Error(payload?.error?.json?.message || `Échec ${path}.`)
  return payload?.result?.data?.json ?? payload
}

const login = await mutation("auth.login", { email, password })
const otp = await query("auth.devPeekOtp", { userId: login.userId })
const verification = await fetch(`${apiBaseUrl}/api/auth/verify-otp`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: login.userId, code: otp.code, device: "VTEX card integration validation" }),
})
if (!verification.ok) throw new Error("Impossible de créer la session de recette.")
const rawCookie = typeof verification.headers.getSetCookie === "function" ? verification.headers.getSetCookie()[0] : verification.headers.get("set-cookie")
const cookie = rawCookie?.split(";")[0]
if (!cookie?.startsWith("vtex_session=")) throw new Error("Cookie de session absent.")

const before = await mutation("wallets.bootstrap", undefined, cookie)
const card = before.cards?.find((item) => item.status === "active")
if (!before.account?.id || !card?.id) throw new Error("Compte ou carte active non provisionné.")
const key = `card-recipe-${crypto.randomUUID()}`
await mutation("walletAdmin.adjustBalance", {
  walletAccountId: Number(before.account.id),
  deltaCents: 10_000,
  reason: `Crédit de recette carte ${key}`,
  idempotencyKey: `adjust-${key}`,
}, cookie)
const payment = await mutation("cards.authorizePayment", {
  cardId: Number(card.id),
  amountCents: 2_500,
  merchantName: "Recette VTEX Wallet",
  channel: "online",
  idempotencyKey: key,
}, cookie)
const replay = await mutation("cards.authorizePayment", {
  cardId: Number(card.id),
  amountCents: 2_500,
  merchantName: "Recette VTEX Wallet",
  channel: "online",
  idempotencyKey: key,
}, cookie)
const after = await mutation("wallets.bootstrap", undefined, cookie)
const cardPayment = after.transactions?.find((transaction) => transaction.id === payment.transaction?.id || transaction.reference === payment.reference)
if (!cardPayment || cardPayment.type !== "card_payment" || cardPayment.status !== "completed") throw new Error("Transaction carte validée absente du bootstrap.")
if ((replay.transaction?.id ?? replay.id) !== (payment.transaction?.id ?? payment.id)) throw new Error("Le rejeu idempotent n’a pas renvoyé la transaction initiale.")
if (Number(after.account.availableBalanceCents) !== Number(before.account.availableBalanceCents) + 7_500) throw new Error("Solde final inattendu après crédit et paiement carte.")

console.log(JSON.stringify({
  cardPaymentAuthorized: true,
  idempotentReplay: true,
  transactionId: payment.transaction?.id ?? cardPayment.id,
  endingBalanceCents: after.account.availableBalanceCents,
}, null, 2))
