"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@vtex/router"
import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from "@stripe/stripe-js"
import { CURRENCY_SYMBOLS, format, type Currency } from "@vtex/money"

import { api } from "@/lib/trpc"
import "../../topup/topup.css"
import "./pay.css"

type Outputs = inferRouterOutputs<AppRouter>
type PublicLink = Outputs["publicPayments"]["get"]
type Settled = Outputs["publicPayments"]["confirm"]
type View = "input" | "proc" | "ok" | "ko"

/* ── icônes SVG inline (Solar Bold : fill-first ou stroke 2.1-2.6) ── */
const P: Record<string, string> = {
  check: '<path d="m5.5 12.5 4.3 4.3L18.5 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="3.2" fill="currentColor"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  shield: '<path d="M12 3.2 5 6v5.6c0 4.1 2.8 7.4 7 9.2 4.2-1.8 7-5.1 7-9.2V6z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="m9 12 2.2 2.2 3.9-4" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  card: '<rect x="3.2" y="5.8" width="17.6" height="12.4" rx="3.4" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M3.6 10.4h16.8" stroke="currentColor" stroke-width="2.3"/>',
  wallet: '<rect x="3.2" y="6.4" width="17.6" height="12.8" rx="3.4" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M15.6 12.8h2.4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  arrow: '<path d="M6 12h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  alert: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M12 7.6v5.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.4" fill="currentColor"/>',
  hash: '<path d="M9.5 4 7.5 20M16.5 4l-2 16M4 9h16M3.5 15h16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
  clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M12 7v5.4l3.4 2" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  bank: '<path d="M3.5 9.5 12 4l8.5 5.5" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 11v7M12 11v7M18 11v7M4 20h16" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
  user: '<circle cx="12" cy="8.4" r="3.6" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M5 19.6c.9-3.3 3.7-5 7-5s6.1 1.7 7 5" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
  print: '<path d="M7 9V4.5h10V9M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 14h10v5.5H7z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
  link: '<path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1 1M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1-1" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
}
function Icon({ name, size }: { name: string; size: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] }} />
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
const fmt = (cents: number, currency: string) => format(Math.round(cents), currency as Currency)
const numOnly = (cents: number, currency: string) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: currency === "XPF" ? 0 : 2, maximumFractionDigits: currency === "XPF" ? 0 : 2 }).format(cents / divisor(currency))
const SYMBOL: Record<string, string> = CURRENCY_SYMBOLS
const clock = (d = new Date()) => [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":")
const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", cartes_bancaires: "CB" }
const brandLabel = (b: string | null | undefined) => (b ? BRANDS[b.toLowerCase()] ?? b : "Carte")
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const errMsg = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "V"
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** La clé d'idempotence survit à un rechargement de page : rejouer le paiement en cours ne crée jamais un second débit. */
function idempotencyKeyFor(slug: string): string {
  const storageKey = `vtex.pay.${slug}`
  try {
    const saved = window.sessionStorage.getItem(storageKey)
    if (saved) return saved
  } catch { /* stockage indisponible : la clé vit seulement en mémoire */ }
  const fresh = `pay-${crypto.randomUUID()}`
  try { window.sessionStorage.setItem(storageKey, fresh) } catch { /* idem */ }
  return fresh
}
function forgetKey(slug: string) {
  try { window.sessionStorage.removeItem(`vtex.pay.${slug}`) } catch { /* rien à oublier */ }
}

const STEPS = (business: string): Array<{ title: string; text: string; icon: string }> => [
  { title: "Paiement initialisé", text: "Votre paiement est enregistré et sécurisé.", icon: "card" },
  { title: "Validation par votre banque", text: "Votre banque peut afficher une fenêtre de confirmation (3D Secure).", icon: "bank" },
  { title: "Paiement confirmé", text: "Votre banque a validé la transaction.", icon: "shield" },
  { title: `${business} est crédité`, text: "Le commerçant reçoit les fonds.", icon: "wallet" },
]

export default function PublicPaymentPage() {
  const { slug } = useParams<{ slug: string }>()

  const [link, setLink] = React.useState<PublicLink | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [payerName, setPayerName] = React.useState("")
  const [payerEmail, setPayerEmail] = React.useState("")
  const [view, setView] = React.useState<View>("input")
  const [stage, setStage] = React.useState(0)
  const [stamps, setStamps] = React.useState<string[]>([])
  const [reference, setReference] = React.useState<string | null>(null)
  const [settled, setSettled] = React.useState<Settled | null>(null)
  const [paidAt, setPaidAt] = React.useState("")
  const [failure, setFailure] = React.useState<string | null>(null)
  const [bank, setBank] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [simNum, setSimNum] = React.useState("4242 4242 4242 4242")
  const [simExp, setSimExp] = React.useState("12 / 30")
  const [simCvc, setSimCvc] = React.useState("123")

  const stripeRef = React.useRef<Stripe | null>(null)
  const elementsRef = React.useRef<StripeElements | null>(null)
  const peRef = React.useRef<StripePaymentElement | null>(null)
  const mountRef = React.useRef<HTMLDivElement | null>(null)

  const mode = link?.stripe.mode ?? null
  const currency = link?.currency ?? "EUR"
  const amount = link?.amountCents ?? 0
  const business = link?.businessName ?? "le commerçant"
  const nameOk = payerName.trim().length >= 2
  const emailOk = EMAIL.test(payerEmail.trim())
  const ready = Boolean(link?.payable) && nameOk && emailOk

  React.useEffect(() => {
    let cancelled = false
    api.publicPayments.get.query({ slug })
      .then((result) => { if (!cancelled) { setLink(result); document.title = `Payer ${result.name} — ${result.businessName}` } })
      .catch((error) => { if (!cancelled) setLoadError(errMsg(error, "Ce lien de paiement n’est pas disponible.")) })
    return () => { cancelled = true }
  }, [slug])

  /* ── retour d'une redirection du prestataire (?ref=PLP-…) ── */
  React.useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")
    if (!ref) return
    setReference(ref)
    setView("proc"); setStage(2)
    void settleLoop(ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Payment Element du prestataire (modes test / live) : le numéro de carte ne touche jamais nos serveurs ── */
  React.useEffect(() => {
    if (!link || !link.payable || link.stripe.mode === "sim" || !link.stripe.publishableKey || view !== "input" || !mountRef.current) return
    let disposed = false
    const host = mountRef.current
    void loadStripe(link.stripe.publishableKey).then((stripe) => {
      if (disposed || !stripe || !host) return
      stripeRef.current = stripe
      const elements = stripe.elements({
        mode: "payment",
        amount: Math.max(link.amountCents, 50),
        currency: link.currency.toLowerCase(),
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
      const element = elements.create("payment", { layout: "tabs", fields: { billingDetails: { name: "never", email: "never" } } })
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
  }, [link, view])

  /* ── flux de paiement ── */
  function stampStage(index: number) {
    setStamps((prev) => { const next = [...prev]; next[index] = clock(); return next })
  }
  function fail(message: string) {
    setFailure(message)
    setBank(false)
    forgetKey(slug)
    setView("ko")
  }
  async function finish(result: Settled) {
    setSettled(result)
    setStage(3); stampStage(3)
    setPaidAt(new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date()))
    forgetKey(slug)
    await sleep(700)
    setView("ok")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  async function settleLoop(ref: string) {
    for (let i = 0; i < 15; i++) {
      try {
        const result = await api.publicPayments.confirm.mutate({ reference: ref })
        if (result.status === "succeeded") { setStage(2); stampStage(2); await finish(result); return }
        if (result.status === "failed" || result.status === "canceled") { fail(result.failureMessage ?? "Le paiement n’a pas abouti. Aucun montant n’a été débité."); return }
      } catch (error) {
        fail(errMsg(error, "Impossible de vérifier le paiement."))
        return
      }
      await sleep(2000)
    }
    setFormError("Le paiement est encore en cours de vérification. Ne payez pas une seconde fois : le commerçant sera crédité dès sa confirmation.")
  }

  async function pay() {
    if (!link || !ready || busy) return
    setBusy(true); setFormError(null); setFailure(null); setStamps([]); setBank(false)
    try {
      if (mode !== "sim") {
        const submitted = await elementsRef.current?.submit()
        if (!submitted || submitted.error) { setFormError(submitted?.error?.message ?? "Vérifiez les informations de votre carte."); setBusy(false); return }
      }
      if (mode === "sim") setView("proc")
      setStage(0); stampStage(0)
      const created = await api.publicPayments.start.mutate({ slug, payerName: payerName.trim(), payerEmail: payerEmail.trim(), idempotencyKey: idempotencyKeyFor(slug) })
      setReference(created.reference)
      if (created.status === "succeeded") { setView("proc"); setStage(2); await finish(created as Settled); return }
      setStage(1); stampStage(1)

      if (mode === "sim") {
        const outcome = await api.publicPayments.simPay.mutate({ reference: created.reference, cardNumber: simNum })
        if (outcome.status === "succeeded") { setStage(2); stampStage(2); await finish(outcome); return }
        if (outcome.status === "requires_action") { setBank(true); setBusy(false); return }
        fail(outcome.failureMessage ?? "Votre banque a décliné la transaction.")
        return
      }

      const stripe = stripeRef.current
      const elements = elementsRef.current
      if (!stripe || !elements || !created.clientSecret) throw new Error("Le formulaire de paiement n’est pas prêt. Rechargez la page puis réessayez.")
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: created.clientSecret,
        confirmParams: { return_url: `${window.location.origin}/pay/${slug}?ref=${created.reference}`, payment_method_data: { billing_details: { name: payerName.trim(), email: payerEmail.trim() } } },
        redirect: "if_required",
      })
      if (result.error) {
        await api.publicPayments.confirm.mutate({ reference: created.reference }).catch(() => null)
        fail(result.error.message ?? "Votre banque a décliné la transaction.")
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
      const result = await api.publicPayments.simAuthenticate.mutate({ reference })
      setBank(false); setStage(2); stampStage(2)
      if (result.status === "succeeded") await finish(result)
      else await settleLoop(reference)
    } catch (error) {
      fail(errMsg(error, "La validation bancaire a échoué."))
    } finally {
      setBusy(false)
    }
  }

  function retry() {
    setView("input"); setStage(0); setFailure(null); setBank(false); setSettled(null); setReference(null); setFormError(null)
    if (window.location.search) window.history.replaceState(null, "", `/pay/${slug}`)
  }

  const header = (
    <header className="bar">
      <div className="wm"><div className="wm-tile" aria-hidden="true">VTEX</div><div><b>VTEX</b><small>Paiement par lien</small></div></div>
      <span className="sec-pill"><Icon name="lock" size={14} />Paiement sécurisé</span>
    </header>
  )

  /* ── lien introuvable ou indisponible ── */
  if (loadError || (link && !link.payable && view === "input")) {
    const message = loadError ?? link?.unavailableReason ?? "Ce lien ne peut pas recevoir de paiement pour le moment."
    return (
      <div className="tp pay"><div className="page">
        {header}
        <div className="stage"><section aria-live="polite"><div className="sheet-wrap"><div className="sheet">
          <div className="head"><b>VTEX · Paiement</b></div><Dashes />
          <div className="off">
            <span className="socle" aria-hidden="true"><Icon name="alert" size={28} /></span>
            <h1 className="title">Ce lien<br />est indisponible.</h1>
            <p className="lede" role="alert">{message}</p>
            {link ? <p className="hint">Contactez {link.businessName} pour obtenir un nouveau lien. Rien n’a été débité.</p> : <p className="hint">Vérifiez l’adresse reçue, ou contactez la personne qui vous l’a envoyée. Rien n’a été débité.</p>}
          </div>
        </div></div></section></div>
      </div></div>
    )
  }

  if (!link) {
    return (
      <div className="tp pay"><div className="page">
        {header}
        <div className="stage"><section aria-live="polite"><div className="sheet-wrap"><div className="sheet" role="status">
          <div className="head"><b>VTEX · Paiement</b></div><Dashes />
          <p className="kicker">Chargement</p>
          <h1 className="title">Préparation<br />du paiement…</h1>
        </div></div></section></div>
      </div></div>
    )
  }

  const steps = STEPS(link.businessName)
  const receiptRows: Array<[string, string, string, string, boolean]> = settled ? [
    ["f", "Montant payé", "wallet", fmt(settled.amountCents, settled.currency), false],
    ["b", "Payé à", "user", link.businessName, false],
    ["r", "Moyen de paiement", "card", `${brandLabel(settled.cardBrand)} •••• ${settled.cardLast4 ?? "----"}`, false],
    ["t", "Référence", "hash", settled.reference, true],
    ["f", "Date", "clock", paidAt, false],
  ] : []

  return (
    <div className="tp pay">
      <div className="page">
        {header}
        <div className="stage">
          <section aria-live="polite">
            <div className="sheet-wrap"><div className="sheet">
              {view === "ok" && <Stamp kind="ok" text="PAYÉ" />}
              {view === "ko" && <Stamp kind="ko" text="REFUSÉ" />}
              <div className="head">
                <b>{view === "ok" || view === "ko" ? "VTEX · Reçu de paiement" : "VTEX · Paiement"}</b>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {mode && mode !== "live" && <span className="mode">{mode === "sim" ? "Simulation" : "Test"}</span>}
                  <span className="ref">{reference ? `N° ${reference}` : "N° en attente"}</span>
                </span>
              </div>
              <Dashes />

              {view === "input" && (
                <>
                  <div className="blk" style={{ gap: 16 }}>
                    <div className="merchant">
                      <span className="socle md" aria-hidden="true">{initials(link.businessName)}</span>
                      <span className="merchant-t"><small>Encaissé par</small><b>{link.businessName}</b></span>
                    </div>
                    <h1 className="title">{link.name}</h1>
                    {link.description ? <p className="lede">{link.description}</p> : null}
                  </div>

                  <div className="amount">
                    <p className="kicker">Montant à payer</p>
                    <p className="big num"><span>{numOnly(amount, currency)}</span><small>{SYMBOL[currency] ?? currency}</small></p>
                    <div className="chips">
                      <span className="chip"><Icon name="lock" size={14} />Montant fixé par le commerçant</span>
                      <span className="chip"><Icon name="user" size={14} />Aucun compte nécessaire</span>
                    </div>
                  </div>

                  <div className="blk">
                    <h2 className="blk-t">Vos informations</h2>
                    <label className="field"><span>Nom</span><input className="inp" autoComplete="name" value={payerName} onChange={(event) => setPayerName(event.target.value)} placeholder="Prénom Nom" maxLength={160} aria-invalid={payerName !== "" && !nameOk ? true : undefined} /></label>
                    <label className="field"><span>Adresse e-mail</span><input className="inp" type="email" autoComplete="email" inputMode="email" value={payerEmail} onChange={(event) => setPayerEmail(event.target.value)} placeholder="vous@exemple.fr" maxLength={160} aria-invalid={payerEmail !== "" && !emailOk ? true : undefined} /></label>
                    {payerEmail !== "" && !emailOk ? <p className="hint err" role="alert">Indiquez une adresse e-mail valide.</p> : <p className="hint">Sert uniquement à identifier ce paiement et à vous adresser un reçu.</p>}
                  </div>

                  <div className="blk">
                    <h2 className="blk-t">Carte bancaire</h2>
                    {mode === "sim" ? (
                      <>
                        <p className="notice"><b>Simulation locale.</b> Aucune vraie carte, aucun débit. Essayez <b>4242 4242 4242 4242</b> (direct), <b>4000 0027 6000 3184</b> (3D Secure) ou <b>4000 0000 0000 0002</b> (refus).</p>
                        <label className="field"><span>Numéro de carte</span><span className="inwrap"><input className="inp mono" inputMode="numeric" autoComplete="off" value={simNum} onChange={(event) => setSimNum(event.target.value.replace(/[^\d ]/g, "").slice(0, 23))} placeholder="1234 1234 1234 1234" /></span></label>
                        <div className="two">
                          <label className="field"><span>Expiration</span><input className="inp mono" inputMode="numeric" autoComplete="off" value={simExp} onChange={(event) => setSimExp(event.target.value)} placeholder="MM / AA" /></label>
                          <label className="field"><span>Code CVC</span><input className="inp mono" inputMode="numeric" autoComplete="off" value={simCvc} onChange={(event) => setSimCvc(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="•••" /></label>
                        </div>
                      </>
                    ) : (
                      <div className="pe" ref={mountRef} />
                    )}
                    <p className="secure"><Icon name="shield" size={20} /><span>Paiement chiffré par notre prestataire. VTEX ne voit ni ne stocke le numéro de votre carte.</span></p>
                  </div>

                  <Dashes />
                  <div className="lines">
                    <div className="ln"><span className="l">{link.name}</span><span className="d" /><span className="v">{fmt(amount, currency)}</span></div>
                    <div className="ln"><span className="l">Frais pour vous</span><span className="d" /><span className="v free">Offerts</span></div>
                    <div className="ln"><span className="l">Encaissé par</span><span className="d" /><span className="v">{link.businessName}</span></div>
                  </div>
                  <Dashes />
                  <div className="tot"><p className="kicker">À débiter sur la carte</p><b>{fmt(amount, currency)}</b></div>
                  <div className="blk" style={{ gap: 12 }}>
                    {formError && <p className="hint err" role="alert">{formError}</p>}
                    <button type="button" className="cta" disabled={!ready || busy} onClick={() => void pay()}>
                      <span>{busy ? "Paiement en cours…" : ready ? `Payer ${fmt(amount, currency)}` : "Renseignez vos informations"}</span>
                      <span className="past"><Icon name="lock" size={18} /></span>
                    </button>
                    <p className="legal">En payant, vous autorisez le débit de votre carte du montant indiqué au profit de {link.businessName}. Conservez la référence du reçu.</p>
                  </div>
                </>
              )}

              {view === "proc" && (
                <>
                  <div className="blk" style={{ gap: 12 }}>
                    <p className="kicker">Impression du reçu</p>
                    <h1 className="title">Paiement<br />en cours…</h1>
                    <p className="big num" style={{ fontSize: 44 }}>{numOnly(amount, currency)}<small>{SYMBOL[currency] ?? currency}</small></p>
                    <p className="lede">Ne fermez pas cette page : chaque étape est horodatée sur votre reçu.</p>
                  </div>
                  <div className="feedbar" aria-hidden="true"><i style={{ width: `${((stage + 1) / 4) * 100}%` }} /></div>
                  <div className="feed" role="list">
                    {steps.map((step, i) => {
                      const state = i < stage ? "done" : i === stage ? "now" : ""
                      return (
                        <div key={step.title} className={`fl ${state}`} role="listitem">
                          <span className={`socle md${state === "now" && !bank ? " pulse" : ""}`}><Icon name={i < stage ? "check" : step.icon} size={20} /></span>
                          <div className="fl-b">
                            <div className="fl-t"><span>{step.title}</span>{state && stamps[i] ? <i>{stamps[i]}</i> : null}</div>
                            {state && <div className="fl-s">{step.text}</div>}
                            {i === 1 && bank && (
                              <div className="slip">
                                <p><b>Votre banque vous demande de confirmer.</b> Validez le paiement dans son application ou saisissez le code reçu par SMS.</p>
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
                  {formError && <p className="notice" role="alert">{formError}</p>}
                  {formError && reference && <button type="button" className="ghost" onClick={() => { setFormError(null); void settleLoop(reference) }}>Vérifier maintenant</button>}
                </>
              )}

              {view === "ok" && settled && (
                <>
                  <div className="blk" style={{ gap: 12 }}>
                    <p className="kicker">{link.businessName}</p>
                    <h1 className="title">Paiement<br />confirmé.</h1>
                    <p className="lede">{fmt(settled.amountCents, settled.currency)} ont été réglés à <b>{link.businessName}</b> pour « {link.name} ».</p>
                  </div>
                  <div className="lines">
                    {receiptRows.map(([tone, label, icon, value, mono]) => (
                      <div key={label} className={`rc-row ${tone}`}><span className="socle xs"><Icon name={icon} size={16} /></span><span className="lbl">{label}</span><span className={`val${mono ? " id" : ""}`}>{value}</span></div>
                    ))}
                  </div>
                  <Dashes />
                  <div className="tot"><p className="kicker">Total débité</p><b className="pos">{fmt(settled.amountCents, settled.currency)}</b></div>
                  <p className="ok-note"><b>Conservez ce reçu.</b> La référence ci-dessous vous identifie auprès de {link.businessName} en cas de question.</p>
                  <div className="btns">
                    <button type="button" className="cta blue" onClick={() => window.print()}><span>Imprimer le reçu</span><span className="past"><Icon name="print" size={18} /></span></button>
                  </div>
                  <Barcode reference={settled.reference} />
                </>
              )}

              {view === "ko" && (
                <>
                  <div className="blk" style={{ gap: 12 }}>
                    <p className="kicker">{link.businessName}</p>
                    <h1 className="title">Paiement<br />refusé.</h1>
                    <p className="lede">{failure ?? "Votre banque a décliné la transaction."} <b style={{ color: "var(--ink)" }}>Aucun montant n’a été débité.</b></p>
                  </div>
                  <div className="lines"><div className="ln"><span className="l">{link.name}</span><span className="d" /><span className="v">{fmt(amount, currency)}</span></div></div>
                  <Dashes />
                  <div className="tot"><p className="kicker">Débité</p><b className="void">{fmt(amount, currency)}</b></div>
                  <div className="why">
                    <p className="kicker">Ce qui peut l’expliquer</p>
                    {[["Plafond atteint", "Votre banque limite peut-être les paiements en ligne."], ["Fonds insuffisants", "Le compte lié à la carte n’a pas assez de solde."], ["Carte non activée", "Le paiement sur internet doit être activé chez la banque."]].map(([title, detail]) => (
                      <div key={title} className="why-row"><span className="socle sm"><Icon name="alert" size={16} /></span><span><b>{title}</b>{detail}</span></div>
                    ))}
                  </div>
                  <div className="btns">
                    <button type="button" className="cta blue" onClick={retry}><span>Essayer une autre carte</span><span className="past"><Icon name="arrow" size={18} /></span></button>
                  </div>
                </>
              )}
            </div></div>
          </section>
        </div>
      </div>
    </div>
  )
}
