import type { IconName } from "@/lib/nav"

/** Bibliothèque d'icônes SVG Solar Bold, inline uniquement.
 *  LEGDAY §5 : jamais de font-icons (ph, ri, lucide). Stroke 2.1–2.6 ou fill-first.
 *  Toutes tracées sur viewBox 24×24 pour composer naturellement dans les socles 24 px. */

const PATHS: Record<IconName, JSX.Element> = {
  home: (
    <path d="M12 3.2 3.5 10v10a1.3 1.3 0 0 0 1.3 1.3H9V15h6v6.3h4.2A1.3 1.3 0 0 0 20.5 20V10Z" />
  ),
  wallet: (
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v2.5H6.5a.5.5 0 0 0 0 1H18a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm12 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
  ),
  list: (
    <path d="M4.5 6h15v2h-15Zm0 5h15v2h-15Zm0 5h9v2h-9Z" />
  ),
  arrows: (
    <path d="M7 4 3 8l4 4V9h8V7H7Zm10 16 4-4-4-4v3H9v2h8Z" />
  ),
  send: (
    <path d="M3 21 21 12 3 3l3.5 8L15 12l-8.5 1Z" />
  ),
  basket: (
    <path d="M4.5 8h15L18 20a1.5 1.5 0 0 1-1.5 1.4H7.5A1.5 1.5 0 0 1 6 20ZM8 8V6a4 4 0 0 1 8 0v2h-2V6a2 2 0 0 0-4 0v2Z" />
  ),
  link: (
    <path d="M10.6 14.4a3.5 3.5 0 0 1 0-4.95l3-3a3.5 3.5 0 1 1 4.95 4.95l-1.5 1.5-1.42-1.42 1.5-1.5a1.5 1.5 0 1 0-2.12-2.12l-3 3a1.5 1.5 0 0 0 0 2.12Zm2.8-4.8a3.5 3.5 0 0 1 0 4.95l-3 3a3.5 3.5 0 1 1-4.95-4.95l1.5-1.5 1.42 1.42-1.5 1.5a1.5 1.5 0 1 0 2.12 2.12l3-3a1.5 1.5 0 0 0 0-2.12Z" />
  ),
  button: (
    <path d="M4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 19.5 15h-15A1.5 1.5 0 0 1 3 13.5v-3A1.5 1.5 0 0 1 4.5 9Zm3 2.2v1.6h9v-1.6Z" />
  ),
  pos: (
    <path d="M6 3.5h12A1.5 1.5 0 0 1 19.5 5v11a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 16V5A1.5 1.5 0 0 1 6 3.5Zm.5 3v3h11v-3Zm.5 5v1.6h4v-1.6Zm6.5 0v1.6h4v-1.6ZM4 20h16v1.4H4Z" />
  ),
  invoice: (
    <path d="M6 2.5h9L19 6.5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1ZM14 2.5V7h4M8 12h8v1.5H8Zm0 3.5h8V17H8Zm0 3.5h5v1.5H8Z" />
  ),
  quote: (
    <path d="M6 3h9l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v4.5h4M8 12h6l2.5 5H8Z" />
  ),
  cycle: (
    <path d="M12 4a8 8 0 0 1 7.4 5H21l-3 4-3-4h1.9a5 5 0 1 0-4.9 6v2A8 8 0 0 1 12 4Z" />
  ),
  orders: (
    <path d="M5 7 12 3.5 19 7v10L12 20.5 5 17Zm7-1.7L7.2 7.5 12 9.7l4.8-2.2ZM6.5 8.7v7.4l4.75 2.4v-7.4Zm11 0-4.75 2.4v7.4L17.5 16.1Z" />
  ),
  box: (
    <path d="M5 7 12 3.5 19 7v10L12 20.5 5 17ZM12 12l6.5-3.25V7L12 10.25 5.5 7v1.75Z" />
  ),
  people: (
    <path d="M9 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm7-1.5a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5Zm-7 2c3.5 0 6.5 1.75 6.5 4v2.5h-13V15.5c0-2.25 3-4 6.5-4Zm7.5 1c2.7 0 5 1.35 5 3v2.5H17V15.5c0-1.15-.55-2.2-1.4-3Z" />
  ),
  chart: (
    <path d="M4 20V4h1.6v14.4H20V20Zm3-2.5V13h2v4.5Zm3.5 0V9h2v8.5Zm3.5 0V11h2v6.5Zm3.5 0V6.5h2V17.5Z" />
  ),
  "chart-line": (
    <path d="M4 20V4h1.6v14.4H20V20ZM7 15.7l3.7-4.4 3.2 2.5 4.6-5.4 1.2 1L14 15.7l-3.2-2.5-3.2 3.8Z" />
  ),
  "chart-user": (
    <path d="M4 20V4h1.6v14.4H20V20Zm8-5.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm-4.5 3.5c0-1.5 2-2.5 4.5-2.5s4.5 1 4.5 2.5V19H7.5Z" />
  ),
  file: (
    <path d="M6 2.5h8L18.5 7V21a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1ZM13 2.5V7h4M8 11h8v1.5H8Zm0 3h8v1.5H8Zm0 3h5v1.5H8Z" />
  ),
  flag: (
    <path d="M5 3v18h1.5v-7.5h5l.7 2h6.3V5.5h-6.3l-.7-2H5Z" />
  ),
  chargeback: (
    <path d="M12 3a9 9 0 0 1 9 9h-2a7 7 0 0 0-13.6-2.3L7 10v1.5H3V7.5h1.5v1.7A9 9 0 0 1 12 3Zm-.7 5h1.5v4.7l3.2 1.9-.75 1.3-3.95-2.3Z" />
  ),
  shield: (
    <path d="M12 2.5 4 6v6c0 5 3.4 7.7 8 9 4.6-1.3 8-4 8-9V6Zm-1 6h2v4h-2Zm0 5.5h2v2h-2Z" />
  ),
  team: (
    <path d="M8.5 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm7-1a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5Zm-7 2c3.5 0 6.25 1.75 6.25 4v2.5h-12.5V16c0-2.25 2.75-4 6.25-4Zm7 1c2.5 0 4.75 1.25 4.75 2.75V18.5H16V16c0-.75-.3-1.5-.85-2.1A9.5 9.5 0 0 1 15.5 13Z" />
  ),
  role: (
    <path d="M12 2.5 4 6v6c0 5 3.4 7.7 8 9 4.6-1.3 8-4 8-9V6ZM8.5 12l2.5 2.5L15.5 10l-1.2-1.2-3.3 3.3L9.7 10.8Z" />
  ),
  permissions: (
    <path d="M7 10V8a5 5 0 1 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v9A1.5 1.5 0 0 1 18.5 22h-13A1.5 1.5 0 0 1 4 20.5v-9A1.5 1.5 0 0 1 5.5 10Zm2 0h6V8a3 3 0 0 0-6 0Zm2 5.5v3h2v-3a1 1 0 1 0-2 0Z" />
  ),
  approve: (
    <path d="M5 12.5 10 17.5 20 7.5 18.5 6 10 14.5 6.5 11Z" />
  ),
  key: (
    <path d="M15.5 3.5a5 5 0 1 0-4.75 6.4L4 16.65V21h4.25l1.5-1.5v-2h2v-2h2l1.4-1.4a5 5 0 0 0 .35-10.6Zm-.5 3.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" />
  ),
  apps: (
    <path d="M4.5 3.5h6v6h-6Zm9 0h6v6h-6Zm-9 9h6v6h-6Zm9 0h6v6h-6Z" />
  ),
  hook: (
    <path d="M9 3.5a5.5 5.5 0 0 1 4.4 8.8l3.6 5A2.5 2.5 0 1 1 15 18.9l-3.6-5A5.5 5.5 0 1 1 9 3.5Zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
  ),
  sandbox: (
    <path d="M4 4h16v4h-6l-2 2H4Zm0 8h8l2-2h6v10H4Zm2 2v6h12v-6Z" />
  ),
  building: (
    <path d="M5 21V4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 16 4v3h3a1 1 0 0 1 1 1v13ZM8 7h2V5H8Zm3.5 0h2V5h-2ZM8 11h2V9H8Zm3.5 0h2V9h-2ZM8 15h2v-2H8Zm3.5 0h2v-2h-2Zm-3.5 4h2v-2H8Zm3.5 0h2v-2h-2Zm4.5 0h2v-8h-2Z" />
  ),
  coins: (
    <path d="M9 3.5a5.5 5.5 0 0 1 5.4 4.6 5.5 5.5 0 1 1-6.8 6.8A5.5 5.5 0 0 1 9 3.5Zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm6 6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
  ),
  lock: (
    <path d="M7 10V8a5 5 0 1 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v9A1.5 1.5 0 0 1 18.5 22h-13A1.5 1.5 0 0 1 4 20.5v-9A1.5 1.5 0 0 1 5.5 10Zm2 0h6V8a3 3 0 0 0-6 0Z" />
  ),
  "team-set": (
    <path d="M8.5 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm-6 8.5C2.5 17.25 5 15.5 8.5 15.5s6 1.75 6 4V21H2.5ZM17.5 15.5l1.5 1.5 3.5-3.5-1-1L19 15l-.5-.5Z" />
  ),
  bell: (
    <path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 5-2 6-2 7.2a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1c0-1.2-2-2.2-2-7.2A6.5 6.5 0 0 0 12 2.5Zm-2.6 16.1a2.7 2.7 0 0 0 5.2 0Z" />
  ),
  plug: (
    <path d="M7.5 3v4h9V3H18v4h1.5a1 1 0 0 1 1 1v3.5A5.5 5.5 0 0 1 15 17H13v4h-2v-4H9a5.5 5.5 0 0 1-5.5-5.5V8a1 1 0 0 1 1-1H6V3Z" />
  ),
  check: <path d="M5 12.5 10 17.5 20 7.5 18.5 6 10 14.5 6.5 11Z" />,
  close: <path d="M6 6 18 18M18 6 6 18" />,
  dot: <circle cx="12" cy="12" r="3" />,
  plus: <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" />,
  search: (
    <path d="M11 4a7 7 0 1 1-4.4 12.4l-3.5 3.5L1.7 18.5 5.2 15A7 7 0 0 1 11 4Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
  ),
  external: (
    <path d="M13 3h8v8h-2V6.4l-9.3 9.3L8.3 14.3 17.6 5H13Zm-9 4h6v2H6v9h9v-4h2v6H4Z" />
  ),
  copy: (
    <path d="M8 2.5h9A1.5 1.5 0 0 1 18.5 4v11h-2V4.5h-8Zm-3.5 4h9A1.5 1.5 0 0 1 15 8v12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 20V8a1.5 1.5 0 0 1 1.5-1.5Z" />
  ),
  download: (
    <path d="M11 3h2v10.2l3.6-3.6 1.4 1.4L12 17 6 11l1.4-1.4 3.6 3.6Zm-7 15h16v2H4Z" />
  ),
  eye: (
    <path d="M12 5c5 0 9 3.4 10.5 7-1.5 3.6-5.5 7-10.5 7S3 15.6 1.5 12C3 8.4 7 5 12 5Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
  ),
  cog: (
    <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM10.9 2h2.2l.6 2.6 2.4 1 2.3-1.2 1.55 1.6-1.15 2.2 1 2.4 2.6.6v2.2l-2.6.6-1 2.4 1.15 2.2-1.55 1.6-2.3-1.2-2.4 1-.6 2.6h-2.2l-.6-2.6-2.4-1-2.3 1.2L4.05 18.4l1.15-2.2-1-2.4-2.6-.6v-2.2l2.6-.6 1-2.4L4.05 5.8 5.6 4.2l2.3 1.2 2.4-1Z" />
  ),
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
  stroke?: boolean
  strokeWidth?: number
}

export function Icon({ name, size = 20, className, stroke, strokeWidth = 2.2 }: IconProps) {
  const g = PATHS[name]
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={stroke ? "none" : "currentColor"}
      stroke={stroke ? "currentColor" : "none"}
      strokeWidth={stroke ? strokeWidth : 0}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {g}
    </svg>
  )
}
