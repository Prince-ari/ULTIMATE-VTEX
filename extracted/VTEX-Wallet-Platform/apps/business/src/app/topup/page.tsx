"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"
import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from "@stripe/stripe-js"

import { canConvert, convert, CURRENCY_SYMBOLS, EUR_XPF_RATE, format, type Currency } from "@vtex/money"

import { api } from "@/lib/trpc"
import { useBusinessContext } from "@/lib/business-context"
import { useDisplayCurrency } from "@/lib/display-currency"
import "./topup.css"

type Outputs = inferRouterOutputs<AppRouter>
type Config = Outputs["businessTopups"]["config"]
type Settled = Outputs["businessTopups"]["confirm"]
type Tx = Outputs["wallet"]["listTransactions"][number]
type View = "input" | "proc" | "ok" | "ko"

/* ── icônes SVG inline (Solar Bold : fill-first ou stroke 2.1-2.6) ── */
const P: Record<string, string> = {
  back: '<path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  bolt: '<path d="M13.2 2.5 5 13.5h5.6l-.8 8 8.2-11h-5.6z" fill="currentColor"/>',
  check: '<path d="m5.5 12.5 4.3 4.3L18.5 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="3.2" fill="currentColor"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  shield: '<path d="M12 3.2 5 6v5.6c0 4.1 2.8 7.4 7 9.2 4.2-1.8 7-5.1 7-9.2V6z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="m9 12 2.2 2.2 3.9-4" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  card: '<rect x="3.2" y="5.8" width="17.6" height="12.4" rx="3.4" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M3.6 10.4h16.8" stroke="currentColor" stroke-width="2.3"/>',
  wallet: '<rect x="3.2" y="6.4" width="17.6" height="12.8" rx="3.4" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M15.6 12.8h2.4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  inn: '<path d="M17 7 7 17M7 9v8h8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  out: '<path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  arrow: '<path d="M6 12h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  alert: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M12 7.6v5.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.4" fill="currentColor"/>',
  tag: '<path d="M4.5 4.5h7.6l7.4 7.4-7.6 7.6-7.4-7.4z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><circle cx="8.8" cy="8.8" r="1.4" fill="currentColor"/>',
  hash: '<path d="M9.5 4 7.5 20M16.5 4l-2 16M4 9h16M3.5 15h16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
  clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M12 7v5.4l3.4 2" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  bank: '<path d="M3.5 9.5 12 4l8.5 5.5" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 11v7M12 11v7M18 11v7M4 20h16" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
  cut: '<circle cx="6.5" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="6.5" cy="17" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m8.6 8.6 11 8.4M8.6 15.4l11-8.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
}
function Icon({ name, size }: { name: string; size: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] }} />
}
function Coins({ n, size }: { n: number; size: number }) {
  const discs = Array.from({ length: n }, (_, i) => `<ellipse cx="12" cy="${19 - i * 4.6}" rx="7.6" ry="3.1" fill="currentColor" stroke="#000" stroke-opacity=".18" stroke-width="1"/>`).join("")
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" dangerouslySetInnerHTML={{ __html: discs }} />
}
function Dashes() {
  return <div className="dash" aria-hidden="true">{Array(80).join("- ")}</div>
}
function Barcode({ reference }: { reference: string }) {
  let x = 0
  const bars: React.ReactNode[] = []
  for (let i = 0; i < 52; i++) {
    const w = 1 + ((reference.charCodeAt(i % reference.length) * 7 + i * 13) % 4)
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y={0} width={w} height={44} fill="#0a0d1e" />)
    x += w + (i % 2 === 0 ? 0 : 1.5)
  }
  return (
    <div className="barcode">
      <svg viewBox={`0 0 ${Math.ceil(x)} 44`} preserveAspectRatio="none" role="img" aria-label="Code-barres de la référence">{bars}</svg>
      <span>{reference}</span>
    </div>
  )
}
function Stamp({ kind, text }: { kind: "ok" | "ko"; text: string }) {
  return (
    <svg className={`stamp ${kind}`} viewBox="0 0 160 64" width={136} aria-hidden="true">
      <rect x="3" y="3" width="154" height="58" rx="14" fill="none" stroke="currentColor" strokeWidth="4" />
      <text x="80" y="43" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="28" letterSpacing="3" fill="currentColor">{text}</text>
    </svg>
  )
}

/* ── utilitaires ── */
const divisor = (currency: string) => (currency === "XPF" ? 1 : 100)
/** « 1 234,56 € » / « 119 000 ₣ » : le franc Pacifique s'écrit toujours avec son signe ₣ (jamais « XPF » ni « F CFP »). */
const fmt = (cents: number, currency: string) => format(Math.round(cents), currency as Currency)
const numOnly = (cents: number, currency: string) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: currency === "XPF" ? 0 : 2, maximumFractionDigits: currency === "XPF" ? 0 : 2 }).format(cents / divisor(currency))
const SYMBOL: Record<string, string> = CURRENCY_SYMBOLS
/** Montant d'un compte (ou d'une opération) présenté dans la devise de paiement choisie, à la parité fixe EUR↔XPF. */
const inCurrency = (cents: number, from: string, to: string) => (canConvert(from as Currency, to as Currency) ? convert(Math.round(cents), from as Currency, to as Currency) : Math.round(cents))
/** Préréglages : le plafond par recharge du Wallet Pro (5 000 €) en dernier ; équivalents ronds en francs Pacifique (596 000 ₣ < 596 658 ₣). */
const PRESETS: Record<string, number[]> = { EUR: [10_000, 25_000, 100_000, 500_000], XPF: [12_000, 30_000, 120_000, 596_000], USD: [10_000, 25_000, 100_000, 500_000] }
const clock = (d = new Date()) => [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":")
const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", cartes_bancaires: "CB" }
const brandLabel = (b: string | null | undefined) => (b ? BRANDS[b.toLowerCase()] ?? b : "Carte")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function relative(value: Date | string) {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (mins < 1) return "à l’instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(value))
}
function errMsg(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

const STEPS: Array<{ title: string; text: string; icon: string }> = [
  { title: "Paiement initialisé", text: "La recharge est enregistrée et sécurisée.", icon: "card" },
  { title: "Validation par ta banque", text: "Ta banque peut afficher une fenêtre de confirmation (3D Secure).", icon: "bank" },
  { title: "Paiement confirmé par Stripe", text: "Les fonds sont sécurisés sur le compte de VTEX.", icon: "shield" },
  { title: "Wallet crédité", text: "Ton solde et ton activité se mettent à jour.", icon: "wallet" },
]

function useCountUp(target: number, enabled: boolean) {
  const [shown, setShown] = React.useState(target)
  const shownRef = React.useRef(target)
  React.useEffect(() => {
    if (!enabled || shownRef.current === target) { shownRef.current = target; setShown(target); return }
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion:reduce)").matches
    if (reduce) { shownRef.current = target; setShown(target); return }
    const from = shownRef.current
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100)
      const value = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)))
      shownRef.current = value
      setShown(value)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    // Si le navigateur suspend les animations (onglet en arrière-plan), la valeur finale s'affiche quand même.
    const fallback = window.setTimeout(() => { shownRef.current = target; setShown(target) }, 1400)
    return () => { cancelAnimationFrame(raf); window.clearTimeout(fallback) }
  }, [target, enabled])
  return shown
}

export default function TopupPage() {
  const router = useRouter()
  const { business, businessId } = useBusinessContext()

  const [cfg, setCfg] = React.useState<Config | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [txs, setTxs] = React.useState<Tx[]>([])
  const [acctId, setAcctId] = React.useState<number | null>(null)
  const [amount, setAmount] = React.useState(0)
  const [custom, setCustom] = React.useState("")
  const [name, setName] = React.useState(business.legalName)
  const [view, setView] = React.useState<View>("input")
  const [stage, setStage] = React.useState(0)
  const [stamps, setStamps] = React.useState<string[]>([])
  const [reference, setReference] = React.useState<string | null>(null)
  const [settled, setSettled] = React.useState<Settled | null>(null)
  const [paidAt, setPaidAt] = React.useState<string>("")
  const [failure, setFailure] = React.useState<string | null>(null)
  const [bank, setBank] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [simNum, setSimNum] = React.useState("4000 0027 6000 3184")
  const [simExp, setSimExp] = React.useState("12 / 28")
  const [simCvc, setSimCvc] = React.useState("123")

  const idemRef = React.useRef<string | null>(null)
  const stripeRef = React.useRef<Stripe | null>(null)
  const elementsRef = React.useRef<StripeElements | null>(null)
  const peRef = React.useRef<StripePaymentElement | null>(null)
  const mountRef = React.useRef<HTMLDivElement | null>(null)

  const { display, setDisplay } = useDisplayCurrency()
  const account = cfg?.accounts.find((a) => a.id === acctId) ?? null
  const accountCurrency = account?.currency ?? "EUR"
  /* Devise de paiement : la devise d'affichage si le compte l'accepte (EUR ↔ XPF, converti à la parité fixe au crédit), sinon celle du compte. */
  const payable = account?.payableCurrencies ?? [accountCurrency]
  const currency = (payable as string[]).includes(display) ? display : accountCurrency
  const otherCurrency = currency === "XPF" ? "EUR" : "XPF"
  const limits = cfg?.limitsByCurrency?.[currency]
  const min = limits?.minCents ?? cfg?.minCents ?? 0
  const perRechargeMax = limits?.maxCents ?? cfg?.maxCents ?? 0
  /* Plafond effectif : 5 000 € par recharge pour le Wallet Pro, dans la limite de ce qui reste des 5 000 € par 24 h (recalculé par le serveur). */
  const max = limits?.effectiveMaxCents ?? cfg?.effectiveMaxCents ?? cfg?.maxCents ?? 0
  const dailyRemaining = limits?.dailyRemainingCents ?? cfg?.dailyRemainingCents ?? 0
  const dailyMax = limits?.dailyMaxCents ?? cfg?.dailyMaxCents ?? 0
  /* Équivalent affiché dans l'autre devise : le plafond arrondi vers le bas par le serveur (jamais 596 659 ₣ pour 5 000 €). */
  const otherMax = cfg?.limitsByCurrency?.[otherCurrency]?.maxCents ?? inCurrency(perRechargeMax, currency, otherCurrency)
  const equivalent = canConvert(currency as Currency, otherCurrency as Currency) ? ` (≈ ${fmt(otherMax, otherCurrency)})` : ""
  const valid = amount >= min && amount <= max && amount > 0
  const mode = cfg?.mode ?? null
  const presets = PRESETS[currency] ?? PRESETS.EUR
  /* Montant proposé : le préréglage « populaire », ramené sous le plafond si besoin. */
  const pickDefault = React.useCallback(() => {
    const wanted = presets[1]
    if (!max || wanted <= max) return wanted
    const fitting = presets.filter((p) => p <= max)
    return fitting.length ? fitting[fitting.length - 1] : Math.max(min, max)
  }, [presets, max, min])

  /* ── chargement : configuration, comptes, activité ── */
  const refresh = React.useCallback(async () => {
    const [config, list] = await Promise.all([
      api.businessTopups.config.query({ businessId }),
      api.wallet.listTransactions.query({ businessId, limit: 6 }),
    ])
    setCfg(config)
    setTxs(list)
    return config
  }, [businessId])

  React.useEffect(() => {
    let cancelled = false
    refresh().then((config) => {
      if (cancelled) return
      // Liens profonds : /topup?account=ID ou /topup?card=ID présélectionnent le compte (ou celui de la carte) à charger.
      const params = new URLSearchParams(window.location.search)
      const wantedAccount = Number(params.get("account"))
      const wantedCard = Number(params.get("card"))
      const fromCard = wantedCard ? config.cards.find((c) => c.id === wantedCard)?.businessWalletAccountId : undefined
      const preselected = config.accounts.find((a) => a.id === (fromCard ?? wantedAccount))?.id
      setAcctId((current) => current ?? preselected ?? config.accounts[0]?.id ?? null)
    }).catch((error) => { if (!cancelled) setLoadError(errMsg(error, "Impossible de charger la recharge.")) })
    return () => { cancelled = true }
  }, [refresh])

  /* Montant proposé au premier chargement, puis à chaque changement de devise (les unités diffèrent : on repart d'un montant valide). */
  const lastCurrencyRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!cfg || !account) return
    if (lastCurrencyRef.current === currency) return
    lastCurrencyRef.current = currency
    setCustom("")
    setAmount(pickDefault())
  }, [cfg, account, currency, pickDefault])

  /* ── retour d'une redirection Stripe (?ref=TOP-…) ── */
  React.useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")
    if (!ref) return
    setReference(ref)
    setView("proc"); setStage(2)
    void settleLoop(ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Payment Element Stripe (modes test / live uniquement) ── */
  React.useEffect(() => {
    if (!cfg || !cfg.enabled || cfg.mode === "sim" || !cfg.publishableKey || view !== "input" || !mountRef.current) return
    let disposed = false
    const host = mountRef.current
    void loadStripe(cfg.publishableKey).then((stripe) => {
      if (disposed || !stripe || !host) return
      stripeRef.current = stripe
      const elements = stripe.elements({
        mode: "payment",
        amount: Math.max(amount, 50),
        currency: currency.toLowerCase(),
        paymentMethodTypes: ["card"],
        fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" }],
        appearance: {
          theme: "flat",
          variables: { colorPrimary: "#2A5B84", colorBackground: "#DCDAD0", colorText: "#0a0d1e", colorTextSecondary: "#4d5378", colorDanger: "#B23A32", fontFamily: "Inter, system-ui, sans-serif", borderRadius: "20px", spacingUnit: "4px", fontSizeBase: "14px" },
          rules: {
            ".Input": { padding: "14px 16px", boxShadow: "none", border: "none" },
            ".Input:focus": { boxShadow: "0 0 0 3px rgba(94,124,226,.28)", border: "none" },
            ".Label": { fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "#4d5378" },
            ".Error": { color: "#B23A32", fontWeight: "600" },
          },
        },
      })
      const element = elements.create("payment", { layout: "tabs", fields: { billingDetails: { name: "never" } } })
      element.mount(host)
      elementsRef.current = elements
      peRef.current = element
    })
    return () => {
      disposed = true
      peRef.current?.destroy()
      peRef.current = null
      elementsRef.current = null
    }
    // Le montant est mis à jour séparément ci-dessous : on ne remonte pas le formulaire à chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.mode, cfg?.publishableKey, cfg?.enabled, view, currency])

  React.useEffect(() => {
    if (elementsRef.current && amount >= 50) elementsRef.current.update({ amount })
  }, [amount])

  /* ── flux de paiement ── */
  function stampStage(index: number) {
    setStamps((prev) => { const next = [...prev]; next[index] = clock(); return next })
  }
  function fail(message: string) {
    setFailure(message)
    setBank(false)
    idemRef.current = null
    setView("ko")
  }
  async function finish(result: Settled) {
    setSettled(result)
    setStage(3); stampStage(3)
    setPaidAt(new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date()))
    idemRef.current = null
    await sleep(700)
    setView("ok")
    window.scrollTo({ top: 0, behavior: "smooth" })
    await refresh().catch(() => null)
  }
  async function settleLoop(ref: string) {
    for (let i = 0; i < 15; i++) {
      try {
        const result = await api.businessTopups.confirm.mutate({ reference: ref })
        if (result.status === "succeeded") { setStage(2); stampStage(2); await finish(result); return }
        if (result.status === "failed" || result.status === "canceled") { fail(result.failureMessage ?? "Le paiement n’a pas abouti. Aucun montant n’a été débité."); return }
      } catch (error) {
        fail(errMsg(error, "Impossible de vérifier le paiement."))
        return
      }
      await sleep(2000)
    }
    setFormError("Le paiement est encore en cours de vérification. Ton wallet sera crédité automatiquement dès sa confirmation.")
  }

  async function pay() {
    if (!valid || busy || !account || !cfg?.enabled) return
    setBusy(true); setFormError(null); setFailure(null); setStamps([]); setBank(false)
    try {
      if (mode !== "sim") {
        const submitted = await elementsRef.current?.submit()
        if (!submitted || submitted.error) { setFormError(submitted?.error?.message ?? "Vérifie les informations de ta carte."); setBusy(false); return }
      }
      // En mode réel, le Payment Element doit rester monté jusqu'à confirmPayment : on n'affiche le reçu « en cours » qu'ensuite.
      if (mode === "sim") setView("proc")
      setStage(0); stampStage(0)
      idemRef.current ??= `business-topup:${crypto.randomUUID()}`
      const created = await api.businessTopups.create.mutate({ businessId, businessWalletAccountId: account.id, amountCents: amount, currency: currency !== accountCurrency ? (currency as "EUR" | "USD" | "XPF") : undefined, billingName: name.trim() || undefined, idempotencyKey: idemRef.current })
      setReference(created.reference)
      setStage(1); stampStage(1)

      if (mode === "sim") {
        const outcome = await api.businessTopups.simPay.mutate({ reference: created.reference, cardNumber: simNum })
        if (outcome.status === "succeeded") { setStage(2); stampStage(2); await finish(outcome); return }
        if (outcome.status === "requires_action") { setBank(true); setBusy(false); return }
        fail(outcome.failureMessage ?? "Ta banque a décliné la transaction.")
        return
      }

      const stripe = stripeRef.current
      const elements = elementsRef.current
      if (!stripe || !elements || !created.clientSecret) throw new Error("Le formulaire de paiement n’est pas prêt. Recharge la page puis réessaie.")
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: created.clientSecret,
        confirmParams: { return_url: `${window.location.origin}/topup?ref=${created.reference}`, payment_method_data: { billing_details: { name: name.trim() || business.legalName } } },
        redirect: "if_required",
      })
      if (result.error) {
        await api.businessTopups.confirm.mutate({ reference: created.reference }).catch(() => null)
        fail(result.error.message ?? "Ta banque a décliné la transaction.")
        return
      }
      setView("proc"); setStage(2); stampStage(2)
      await settleLoop(created.reference)
    } catch (error) {
      fail(errMsg(error, "Le paiement n’a pas pu être lancé."))
    } finally {
      setBusy(false)
    }
  }

  async function confirmBank() {
    if (!reference) return
    setBusy(true)
    try {
      const result = await api.businessTopups.simAuthenticate.mutate({ reference })
      setBank(false); setStage(2); stampStage(2)
      if (result.status === "succeeded") await finish(result)
      else await settleLoop(reference)
    } catch (error) {
      fail(errMsg(error, "La validation bancaire a échoué."))
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setView("input"); setStage(0); setFailure(null); setBank(false); setSettled(null); setReference(null); setFormError(null); idemRef.current = null
    if (window.location.search) window.history.replaceState(null, "", "/topup")
  }

  /* ── solde en direct (présenté dans la devise de paiement choisie, à la parité fixe) ── */
  const acctBalance = inCurrency(account?.availableBalanceCents ?? 0, accountCurrency, currency)
  const shownBalance = useCountUp(acctBalance, view === "ok")
  const balAfter = acctBalance + (valid ? amount : 0)
  const quotaLeft = Math.max(0, dailyRemaining - (valid ? amount : 0))
  const txFmt = (t: Tx) => fmt(inCurrency(t.amountCents, t.currency, currency), canConvert(t.currency as Currency, currency as Currency) ? currency : t.currency)
  const receiptRows: Array<[string, string, string, string, boolean]> = settled && account ? [
    ["f", "Montant rechargé", "bolt", fmt(settled.amountCents, settled.currency), false],
    ["b", "Frais de recharge", "tag", fmt(0, settled.currency), false],
    ["r", "Moyen de paiement", "card", `${brandLabel(settled.cardBrand)} •••• ${settled.cardLast4 ?? "----"}`, false],
    ["t", "Référence", "hash", settled.reference, true],
    ["f", "Date", "clock", paidAt, false],
    ["b", "Compte crédité", "wallet", account.label, false],
  ] : []

  if (loadError) {
    return (
      <div className="tp"><div className="page"><div className="sheet-wrap"><div className="sheet">
        <div className="head"><b>VTEX · Reçu de recharge</b></div><Dashes />
        <h1 className="title">Recharge<br />indisponible.</h1>
        <p className="notice">{loadError}</p>
        <button type="button" className="ghost" onClick={() => router.push("/")}>Retour au tableau de bord</button>
      </div></div></div></div>
    )
  }

  return (
    <div className="tp">
      <div className="page">
        <header className="bar">
          <button type="button" className="back" aria-label={view === "input" ? "Retour au tableau de bord" : "Retour à la saisie"} onClick={() => (view === "input" ? router.push("/") : reset())}><Icon name="back" size={24} /></button>
          <div className="wm"><div className="wm-tile" aria-hidden="true">VTEX</div><div><b>VTEX Business</b><small>Recharge par carte</small></div></div>
          <span className="sec-pill"><Icon name="lock" size={14} />Paiement sécurisé</span>
        </header>

        <div className="stage">
          <section aria-live="polite">
            <div className="sheet-wrap"><div className="sheet">
              {view === "ok" && <Stamp kind="ok" text="PAYÉ" />}
              {view === "ko" && <Stamp kind="ko" text="REFUSÉ" />}
              <div className="head">
                <b>VTEX · Reçu de recharge</b>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {mode && <span className={`mode${mode === "live" ? " live" : ""}`}>{mode === "live" ? "Réel" : mode === "sim" ? "Simulation" : "Test"}</span>}
                  <span className="ref">{reference ? `N° ${reference}` : "N° en attente"}</span>
                </span>
              </div>
              <Dashes />

              {view === "input" && (
                <>
                  <div className="blk" style={{ gap: 12 }}>
                    <p className="kicker">Wallet Pro · {business.brandName}</p>
                    <h1 className="title">Recharger<br />le wallet Pro.</h1>
                    <p className="lede">Ajoute des fonds avec la carte bancaire de l’entreprise. Ils sont disponibles dès la confirmation de la banque.</p>
                  </div>

                  {cfg && !cfg.enabled && <p className="notice"><b>Les recharges par carte ne sont pas encore activées.</b> {cfg.reason}</p>}

                  {cfg && cfg.accounts.length > 0 && (
                    <div className="blk">
                      <h2 className="blk-t">Compte ou carte à charger</h2>
                      <div className="acct-list" role="radiogroup" aria-label="Compte ou carte à charger">
                        {cfg.accounts.map((a, i) => {
                          const linked = cfg.cards.filter((c) => c.businessWalletAccountId === a.id)
                          return (
                            <button key={a.id} type="button" className={`acct ${["blue", "teal", "brick"][i % 3]}`} role="radio" aria-checked={acctId === a.id} onClick={() => setAcctId(a.id)}>
                              <span className="socle md"><Icon name="wallet" size={22} /></span>
                              <span className="acct-body">
                                <span className="acct-name">{a.label}</span>
                                <span className="acct-sub">Solde {fmt(inCurrency(a.availableBalanceCents, a.currency, (a.payableCurrencies as string[]).includes(display) ? display : a.currency), (a.payableCurrencies as string[]).includes(display) ? display : a.currency)}</span>
                                {linked.length > 0 && <span className="acct-sub">Carte{linked.length > 1 ? "s" : ""} {linked.map((c) => `•••• ${c.lastFour}`).join(" · ")}</span>}
                              </span>
                              <span className="radio"><Icon name="check" size={16} /></span>
                            </button>
                          )
                        })}
                      </div>
                      <p className="hint">Les cartes d’un compte se rechargent en créditant ce compte. Réservé aux rôles Owner, Admin et Finance.</p>
                    </div>
                  )}

                  <div className="blk">
                    <h2 className="blk-t">Montant</h2>
                    {(payable as string[]).filter((c) => c === "EUR" || c === "XPF").length > 1 && (
                      <div className="ccy" role="radiogroup" aria-label="Devise du paiement">
                        {(["EUR", "XPF"] as const).filter((c) => (payable as string[]).includes(c)).map((c) => (
                          <button key={c} type="button" role="radio" aria-checked={currency === c} onClick={() => setDisplay(c)}><b>{SYMBOL[c]}</b> {c === "XPF" ? "Franc Pacifique" : "Euro"}</button>
                        ))}
                      </div>
                    )}
                    {currency === "XPF" && accountCurrency !== "XPF" && <p className="hint" data-parity>Parité fixe : 1 € = {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(EUR_XPF_RATE)} ₣. Le compte reste en euros : le montant est converti au crédit.</p>}
                    <p className="big num"><span>{numOnly(amount, currency)}</span><small>{SYMBOL[currency] ?? currency}</small></p>
                    <div className="tiles" role="radiogroup" aria-label="Montant de la recharge">
                      {presets.map((p, i) => (
                        <button key={p} type="button" className="tile" role="radio" aria-checked={custom === "" && amount === p} disabled={p > max || p < min} onClick={() => { setAmount(p); setCustom("") }}>
                          <span className="socle t52"><Coins n={i + 1} size={26} /></span>
                          <span className="tile-val">{fmt(p, currency).replace(/[,.]00(?=\D*$)/, "")}</span>
                          {i === 1 && <span className="tile-badge">Populaire</span>}
                        </button>
                      ))}
                    </div>
                    <label className="field"><span>Autre montant</span>
                      <span className="inwrap">
                        <input className="inp amount-input" inputMode="decimal" autoComplete="off" placeholder="0,00" value={custom}
                          onChange={(e) => {
                            const raw = e.target.value
                            setCustom(raw)
                            const parsed = Number(raw.replace(/\s/g, "").replace(",", "."))
                            setAmount(raw.trim() !== "" && Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * divisor(currency)) : 0)
                          }} />
                        <span className="suffix">{SYMBOL[currency] ?? currency}</span>
                      </span>
                    </label>
                    {amount > 0 && amount < min ? <p className="hint err">Montant minimum : {fmt(min, currency)}.</p>
                      : amount > max ? <p className="hint err">{max < perRechargeMax
                        ? (max <= 0 ? `Plafond quotidien atteint : ${fmt(dailyMax, currency)} de recharges par 24 h pour cette entreprise.` : `Plafond quotidien : il reste ${fmt(max, currency)} à recharger sur 24 h pour cette entreprise.`)
                        : `Montant maximum par recharge : ${fmt(perRechargeMax, currency)}${equivalent}.`}</p>
                      : custom !== "" && amount <= 0 ? <p className="hint err">Saisis un montant valide.</p>
                      : <p className="hint">Entre {fmt(min, currency)} et {fmt(perRechargeMax, currency)}{equivalent} par recharge · {fmt(dailyMax, currency)} max par 24 h.</p>}
                    <p className="hint" data-quota>Il te reste <b>{fmt(dailyRemaining, currency)}</b> de plafond sur 24 h, tous comptes de l’entreprise confondus.</p>
                  </div>

                  <div className="blk">
                    <h2 className="blk-t">Carte de l’entreprise</h2>
                    {mode === "sim" ? (
                      <>
                        <p className="notice"><b>Simulation locale.</b> {cfg?.fallback && cfg.reason ? `${cfg.reason} ` : ""}Aucune vraie carte, aucun débit. Essaie <b>4242 4242 4242 4242</b> (direct), <b>4000 0027 6000 3184</b> (3D Secure) ou <b>4000 0000 0000 0002</b> (refus).</p>
                        <label className="field"><span>Numéro de carte</span><span className="inwrap"><input className="inp mono" inputMode="numeric" autoComplete="off" value={simNum} onChange={(e) => setSimNum(e.target.value.replace(/[^\d ]/g, "").slice(0, 23))} placeholder="1234 1234 1234 1234" /></span></label>
                        <div className="two">
                          <label className="field"><span>Expiration</span><input className="inp mono" inputMode="numeric" autoComplete="off" value={simExp} onChange={(e) => setSimExp(e.target.value)} placeholder="MM / AA" /></label>
                          <label className="field"><span>Code CVC</span><input className="inp mono" inputMode="numeric" autoComplete="off" value={simCvc} onChange={(e) => setSimCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="•••" /></label>
                        </div>
                      </>
                    ) : cfg?.enabled ? (
                      <div className="pe" ref={mountRef} />
                    ) : null}
                    <label className="field"><span>Raison sociale sur le reçu</span><input className="inp" autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} /></label>
                    <p className="secure"><Icon name="shield" size={20} /><span>Paiement chiffré par Stripe. VTEX ne voit ni ne stocke le numéro de carte.</span></p>
                  </div>

                  <Dashes />
                  <div className="lines">
                    <div className="ln"><span className="l">Recharge par carte</span><span className="d" /><span className="v">{fmt(Math.max(amount, 0), currency)}</span></div>
                    <div className="ln"><span className="l">Frais de recharge</span><span className="d" /><span className="v free">Offerts</span></div>
                    <div className="ln"><span className="l">Crédité sur</span><span className="d" /><span className="v">{account?.label ?? "—"}</span></div>
                    <div className="ln"><span className="l">Solde après recharge</span><span className="d" /><span className="v">{fmt(balAfter, currency)}</span></div>
                    <div className="ln"><span className="l">Plafond restant (24 h)</span><span className="d" /><span className="v">{fmt(quotaLeft, currency)}</span></div>
                  </div>
                  <Dashes />
                  <div className="tot"><p className="kicker">À débiter sur la carte</p><b>{fmt(Math.max(amount, 0), currency)}</b></div>
                  <div className="blk" style={{ gap: 12 }}>
                    {formError && <p className="hint err" role="alert">{formError}</p>}
                    <button type="button" className="cta" disabled={!valid || busy || !cfg?.enabled} onClick={() => void pay()}>
                      <span>{busy ? "Paiement en cours…" : valid ? `Recharger ${fmt(amount, currency)}` : "Choisis un montant"}</span>
                      <span className="past"><Icon name="lock" size={18} /></span>
                    </button>
                    <p className="legal">En rechargeant, tu autorises VTEX à débiter la carte. Le reçu est conservé dans tes transactions.</p>
                  </div>
                </>
              )}

              {view === "proc" && (
                <>
                  <div className="blk" style={{ gap: 12 }}>
                    <p className="kicker">Impression du reçu</p>
                    <h1 className="title">Recharge<br />en cours…</h1>
                    <p className="big num" style={{ fontSize: 44 }}>{numOnly(amount, currency)}<small>{SYMBOL[currency] ?? currency}</small></p>
                    <p className="lede">Ne ferme pas cette page : chaque étape est horodatée sur ton reçu.</p>
                  </div>
                  <div className="feedbar" aria-hidden="true"><i style={{ width: `${((stage + 1) / 4) * 100}%` }} /></div>
                  <div className="feed" role="list">
                    {STEPS.map((s, i) => {
                      const state = i < stage ? "done" : i === stage ? "now" : ""
                      return (
                        <div key={s.title} className={`fl ${state}`} role="listitem">
                          <span className={`socle md${state === "now" && !bank ? " pulse" : ""}`}><Icon name={i < stage ? "check" : s.icon} size={20} /></span>
                          <div className="fl-b">
                            <div className="fl-t"><span>{s.title}</span>{state && stamps[i] ? <i>{stamps[i]}</i> : null}</div>
                            {state && <div className="fl-s">{s.text}</div>}
                            {i === 1 && bank && (
                              <div className="slip">
                                <p><b>Ta banque te demande de confirmer.</b> Valide le paiement dans son application ou saisis le code reçu par SMS.</p>
                                <div className="codes" aria-hidden="true"><i>•</i><i>•</i><i>•</i><i>•</i><i>•</i><i>•</i></div>
                                <p style={{ fontSize: 12, color: "var(--ink3)" }}>Fenêtre gérée par la banque — VTEX n’y a pas accès.</p>
                                <button type="button" className="mini" disabled={busy} onClick={() => void confirmBank()}>Confirmer avec ma banque</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {formError && <p className="notice">{formError}</p>}
                  {formError && reference && <button type="button" className="ghost" onClick={() => { setFormError(null); void settleLoop(reference) }}>Vérifier maintenant</button>}
                </>
              )}

              {view === "ok" && settled && account && (
                <>
                  <div className="blk" style={{ gap: 12 }}>
                    <p className="kicker">Wallet Pro · {business.brandName}</p>
                    <h1 className="title">Recharge<br />confirmée.</h1>
                    <p className="lede">{fmt(settled.amountCents, settled.currency)} ont été crédités sur <b>{account.label}</b>. Ton solde est à jour.</p>
                  </div>
                  <div className="lines">
                    {receiptRows.map(([tone, label, icon, value, mono]) => (
                      <div key={label} className={`rc-row ${tone}`}><span className="socle xs"><Icon name={icon} size={16} /></span><span className="lbl">{label}</span><span className={`val${mono ? " id" : ""}`}>{value}</span></div>
                    ))}
                  </div>
                  <Dashes />
                  <div className="tot"><p className="kicker">Crédité sur le wallet</p><b className="pos">+{fmt(settled.amountCents, settled.currency)}</b></div>
                  <div className="btns">
                    <button type="button" className="cta blue" onClick={() => router.push("/transactions")}><span>Voir mes transactions</span><span className="past"><Icon name="arrow" size={18} /></span></button>
                    <button type="button" className="ghost" onClick={reset}>Recharger encore</button>
                  </div>
                  <Barcode reference={settled.reference} />
                </>
              )}

              {view === "ko" && (
                <>
                  <div className="blk" style={{ gap: 12 }}>
                    <p className="kicker">Wallet Pro · {business.brandName}</p>
                    <h1 className="title">Paiement<br />refusé.</h1>
                    <p className="lede">{failure ?? "Ta banque a décliné la transaction."} <b style={{ color: "var(--ink)" }}>Aucun montant n’a été débité.</b></p>
                  </div>
                  <div className="lines"><div className="ln"><span className="l">Recharge par carte</span><span className="d" /><span className="v">{fmt(amount, currency)}</span></div></div>
                  <Dashes />
                  <div className="tot"><p className="kicker">Débité</p><b className="void">{fmt(amount, currency)}</b></div>
                  <div className="why">
                    <p className="kicker">Ce qui peut l’expliquer</p>
                    {[["Plafond atteint", "La banque limite peut-être les paiements en ligne."], ["Fonds insuffisants", "Le compte lié à la carte n’a pas assez de solde."], ["Carte non activée", "Le paiement sur internet doit être activé chez la banque."]].map(([t, d]) => (
                      <div key={t} className="why-row"><span className="socle sm"><Icon name="alert" size={16} /></span><span><b>{t}</b>{d}</span></div>
                    ))}
                  </div>
                  <div className="btns">
                    <button type="button" className="cta blue" onClick={reset}><span>Essayer une autre carte</span><span className="past"><Icon name="arrow" size={18} /></span></button>
                    <button type="button" className="ghost" onClick={reset}>Modifier le montant</button>
                  </div>
                </>
              )}
            </div></div>
          </section>

          <aside className="stub-wrap">
            <div className="stub">
              <div className="perf" aria-hidden="true"><Icon name="cut" size={18} /><div className="dash">{Array(60).join("- ")}</div></div>
              <div className="sheet-wrap"><div className="sheet">
                <div className="bal-top"><span className="socle sm" style={{ background: "var(--s-blue)" }}><Icon name="wallet" size={18} /></span><p className="kicker">Solde · {account?.label ?? "Wallet Pro"}</p></div>
                <p className="bal-num num" aria-live="polite"><span>{numOnly(shownBalance, currency)}</span><small>{SYMBOL[currency] ?? currency}</small></p>
                <div className="delta">
                  {view === "ok" && settled ? <span className="pill"><Icon name="inn" size={14} />+{fmt(settled.amountCents, settled.currency)} crédités à l’instant</span>
                    : view === "input" && valid ? <span className="pill"><Icon name="inn" size={14} />+{fmt(amount, currency)} → {fmt(balAfter, currency)}</span>
                    : <span className="delta-idle">Le solde se met à jour dès la confirmation.</span>}
                </div>
                <Dashes />
                <div>
                  <p className="kicker" style={{ marginBottom: 12 }}>Dernières opérations</p>
                  {txs.length === 0 ? <p className="hint">Aucune opération pour le moment.</p> : txs.map((t) => {
                    const kind = t.type === "topup" ? "tpu" : t.direction === "credit" ? "in" : "out"
                    const fresh = view === "ok" && settled?.reference === t.reference
                    return (
                      <div key={t.id} className={`tx ${kind}${fresh ? " fresh" : ""}`}>
                        <span className="socle md"><Icon name={kind === "out" ? "out" : kind === "tpu" ? "card" : "inn"} size={20} /></span>
                        <div className="tx-b"><div className="tx-n">{t.description ?? t.type.replace(/_/g, " ")}</div><div className="tx-m">{relative(t.createdAt)}</div></div>
                        <div className="tx-a">{t.direction === "credit" ? "+" : "−"}{txFmt(t)}</div>
                      </div>
                    )
                  })}
                </div>
              </div></div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
