import Link from "next/link"
import { Sparkline } from "./Sparkline"
import { Icon } from "@/components/ui/Icon"

interface HeroCardProps {
  brand: string
  legalName: string
  balanceLabel: string
  currency: string
  delta: string
  deltaPositive: boolean
  meta: string
  sparkline: number[]
}

/** Hero platinum §8.1 (radius 44) — pur Leg Day : matière crème, gradient 158°,
 *  wordmark VTEX en filigrane, solde display 60 px, sparkline signature, deux
 *  CTA formés en pill avec pastille interne 36 px §8.4. */
export function HeroCard({
  brand,
  legalName,
  balanceLabel,
  currency,
  delta,
  deltaPositive,
  meta,
  sparkline,
}: HeroCardProps) {
  return (
    <section
      className="relative overflow-hidden rounded-[44px] p-6 sm:p-8 lg:p-10 shadow-[0_30px_60px_-20px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.6)]"
      style={{ background: "var(--grad-platinum)" }}
      aria-labelledby="hero-balance"
    >
      {/* Wordmark filigrane */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 top-1/2 -translate-y-1/2 select-none font-extrabold tracking-[-0.05em] text-[#0a0d1e]/[.05]"
        style={{ fontSize: "clamp(120px, 22vw, 260px)", lineHeight: 1 }}
      >
        VTEX
      </div>

      {/* Contenu */}
      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#0E1230] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2)]"
              aria-hidden="true"
            >
              <span className="font-mono text-[9px] font-bold tracking-[.14em]">VTEX</span>
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#4d5378]">
                VTEX Business · Console
              </p>
              <p className="text-[12px] font-semibold text-[#0a0d1e]">
                {brand} <span className="text-[#4d5378]">— {legalName}</span>
              </p>
            </div>
          </div>

          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#4d5378]">
            Solde consolidé · tous comptes
          </p>
          <h1
            id="hero-balance"
            className="font-extrabold leading-[0.95] tracking-[-0.045em] text-[#0a0d1e]"
            style={{ fontSize: "clamp(44px, 6.6vw, 72px)" }}
          >
            {balanceLabel} <span className="text-[#4d5378]">{currency}</span>
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-bold " +
                (deltaPositive
                  ? "border-[#3E8B54]/25 bg-[#97CE5E]/25 text-[#2b5b32]"
                  : "border-[#8E3B36]/25 bg-[#E5903F]/25 text-[#6b2f1a]")
              }
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                {deltaPositive ? (
                  <path d="M4 15h6v6h4v-6h6L12 3Z" />
                ) : (
                  <path d="M4 9h6V3h4v6h6L12 21Z" />
                )}
              </svg>
              {delta}
            </span>
            <span className="text-[12px] text-[#4d5378]">{meta}</span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/payment-links"
              className="group inline-flex items-center gap-2 rounded-full bg-[#0E1230] py-[6px] pl-[18px] pr-[6px] text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform hover:-translate-y-[1px] legday-focus"
            >
              Encaisser un paiement
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0a0d1e]">
                <Icon name="plus" size={16} />
              </span>
            </Link>
            <Link
              href="/topup"
              className="inline-flex items-center gap-2 rounded-full border border-[#0a0d1e]/15 bg-white/60 px-4 py-2 text-[13px] font-bold text-[#0a0d1e] backdrop-blur transition-colors hover:bg-white/90 legday-focus"
            >
              <Icon name="coins" size={14} /> Recharger
            </Link>
            <Link
              href="/invoices"
              className="inline-flex items-center gap-2 rounded-full border border-[#0a0d1e]/15 bg-white/60 px-4 py-2 text-[13px] font-bold text-[#0a0d1e] backdrop-blur transition-colors hover:bg-white/90 legday-focus"
            >
              <Icon name="invoice" size={14} /> Nouvelle facture
            </Link>
          </div>
        </div>

        {/* Sparkline — 30 j sur le total encaissé */}
        <div className="w-full max-w-[280px] shrink-0 rounded-[24px] border border-[#0a0d1e]/10 bg-white/45 p-4 backdrop-blur-sm sm:w-[280px]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d5378]">
              Encaissement · 30 j
            </span>
            <span className="text-[10px] font-bold text-[#3E8B54]">↑ tendance</span>
          </div>
          <Sparkline
            data={sparkline}
            color="#2A5B84"
            fillOpacity={0.22}
            width={252}
            height={72}
            strokeWidth={2.2}
          />
          <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-[#4d5378]">
            <span>15 août</span>
            <span>Aujourd&apos;hui</span>
          </div>
        </div>
      </div>
    </section>
  )
}
