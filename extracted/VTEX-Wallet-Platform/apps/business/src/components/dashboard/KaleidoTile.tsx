import Link from "next/link"
import { Icon } from "@/components/ui/Icon"
import type { IconName } from "@/lib/nav"

/** Palette kaléidoscope LEGDAY §3.3 — 4 couples section/socle validés en prod. */
export const KALEIDO = {
  forest: {
    gradient: "linear-gradient(158deg, #4C9D63 0%, #3E8B54 55%, #327044 100%)",
    socle: "#97CE5E",
    glyph: "#0a0d1e", // socle lime clair → glyphe dark ink §9.3
    surfaceInk: "#f5f7fc",
    subInk: "rgba(245,247,252,.72)",
  },
  blueDeep: {
    gradient: "linear-gradient(158deg, #356E9C 0%, #2A5B84 55%, #22496A 100%)",
    socle: "#5FA8D8",
    glyph: "#0a0d1e",
    surfaceInk: "#f5f7fc",
    subInk: "rgba(245,247,252,.75)",
  },
  brick: {
    gradient: "linear-gradient(158deg, #A04841 0%, #8E3B36 55%, #73302C 100%)",
    socle: "#E5903F",
    glyph: "#0a0d1e",
    surfaceInk: "#f5f7fc",
    subInk: "rgba(245,247,252,.75)",
  },
  teal: {
    gradient: "linear-gradient(158deg, #72C6BE 0%, #62B8B0 55%, #4E9891 100%)",
    socle: "#BFE3A8",
    glyph: "#0a0d1e",
    surfaceInk: "#0a0d1e",
    subInk: "rgba(10,13,30,.65)",
  },
} as const

export type KaleidoKey = keyof typeof KALEIDO

interface KaleidoTileProps {
  kicker: string
  title: string
  hint: string
  href: string
  icon: IconName
  palette: KaleidoKey
  featured?: boolean
}

/** Tuile Leg Day complète §5.1 : 1) couleur pleine analogue, 2) socle contrasté,
 *  3) glyphe fill blanc/dark selon socle, 4) matière = shadow-card + inset. */
export function KaleidoTile({
  kicker,
  title,
  hint,
  href,
  icon,
  palette,
  featured,
}: KaleidoTileProps) {
  const p = KALEIDO[palette]
  return (
    <Link
      href={href}
      className={
        "group relative flex flex-col justify-between overflow-hidden rounded-[32px] p-6 legday-focus " +
        "shadow-[0_10px_28px_-10px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.18)] " +
        "transition-transform hover:-translate-y-[3px] " +
        (featured ? "min-h-[240px]" : "min-h-[200px]")
      }
      style={{ background: p.gradient, color: p.surfaceInk }}
      aria-label={title}
    >
      {/* Halo diagonal §6 subtle : contribue au relief sans reflet vulgaire */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,255,255,.18), transparent 65%)",
        }}
      />

      {/* Socle §5.2 + §8.3 : 56 px avec matière physique */}
      <div
        className="relative flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: p.socle,
          color: p.glyph,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.5), inset 0 -2px 4px rgba(0,0,0,.15), 0 6px 16px -6px rgba(0,0,0,.4)",
        }}
      >
        <Icon name={icon} size={28} />
      </div>

      <div className="relative">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em]" style={{ color: p.subInk }}>
          {kicker}
        </p>
        <h3
          className="font-extrabold leading-[1.05] tracking-[-0.02em]"
          style={{ fontSize: featured ? "22px" : "19px", color: p.surfaceInk }}
        >
          {title}
        </h3>
        <p className="mt-3 text-[12px] leading-[1.5]" style={{ color: p.subInk }}>
          {hint}
        </p>
      </div>

      {/* Chevron affordance */}
      <div
        aria-hidden="true"
        className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full opacity-70 transition-opacity group-hover:opacity-100"
        style={{ background: "rgba(255,255,255,.14)", color: p.surfaceInk }}
      >
        <Icon name="external" size={13} />
      </div>
    </Link>
  )
}
