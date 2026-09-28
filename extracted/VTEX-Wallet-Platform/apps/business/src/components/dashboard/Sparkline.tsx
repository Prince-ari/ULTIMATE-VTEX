import { clsx } from "clsx"

interface SparklineProps {
  data: number[]
  color?: string
  fillOpacity?: number
  width?: number
  height?: number
  strokeWidth?: number
  className?: string
  showDot?: boolean
}

/** Sparkline SVG inline — Leg Day pur : trait signature stroke + zone `area`
 *  remplie en gradient linéaire de la couleur, dot final marquant la valeur
 *  courante. Aucun label texte : la sparkline est un signal, pas une légende. */
export function Sparkline({
  data,
  color = "var(--c-signature)",
  fillOpacity = 0.18,
  width = 220,
  height = 64,
  strokeWidth = 2,
  className,
  showDot = true,
}: SparklineProps) {
  if (data.length === 0) return null

  const padY = 4
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = data.length > 1 ? (width - padY * 2) / (data.length - 1) : 0

  const points = data.map((v, i) => {
    const x = padY + i * stepX
    const y = padY + (1 - (v - min) / range) * (height - padY * 2)
    return { x, y }
  })

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ")

  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${height - padY} L ${points[0].x.toFixed(2)} ${height - padY} Z`

  const last = points[points.length - 1]
  const gradId = `spark-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className={clsx("block", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && (
        <>
          <circle cx={last.x} cy={last.y} r={5} fill={color} fillOpacity={0.2} />
          <circle cx={last.x} cy={last.y} r={2.2} fill={color} />
        </>
      )}
    </svg>
  )
}
