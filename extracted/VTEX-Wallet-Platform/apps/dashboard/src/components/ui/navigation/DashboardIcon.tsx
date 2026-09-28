import type { SVGProps } from "react"

export type DashboardIconName =
  | "analytics"
  | "bell"
  | "computer"
  | "file"
  | "folder"
  | "home"
  | "menu"
  | "more"
  | "moon"
  | "support"
  | "settings"
  | "sun"
  | "user"
  | "user-add"
  | "wallet"
  | "external"
  | "building"
  | "topup"
  | "cards"
  | "bank"
  | "link"
  | "key"
  | "team"
  | "message"
  | "portfolio"

type DashboardIconProps = SVGProps<SVGSVGElement> & { name: DashboardIconName }

function Glyph({ name }: { name: DashboardIconName }) {
  switch (name) {
    case "home": return <><path d="m3 10 9-7 9 7" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></>
    case "user": return <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>
    case "user-add": return <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 21a6.5 6.5 0 0 1 13 0" /><path d="M18 8v6M15 11h6" /></>
    case "wallet": return <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v3H6.5A2.5 2.5 0 0 0 4 10.5v8A2.5 2.5 0 0 0 6.5 21H20V8" /><path d="M15 14h5" /><circle cx="15" cy="14" r=".5" fill="currentColor" /></>
    case "folder": return <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v9A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5Z" /><path d="M3 10h18" /></>
    case "file": return <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>
    case "bell": return <><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 22h4" /></>
    case "analytics": return <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>
    case "support": return <><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><path d="M4 13h3v6H5a1 1 0 0 1-1-1zM20 13h-3v6h2a1 1 0 0 0 1-1zM12 21h3" /></>
    case "settings": return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.1h-3v-.1A1.7 1.7 0 0 0 10.7 18.64a1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.06 15 1.7 1.7 0 0 0 5.5 14H5v-3h.5A1.7 1.7 0 0 0 7.06 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V4.7h3v.1A1.7 1.7 0 0 0 15.76 6.36a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1H21v3h-.04A1.7 1.7 0 0 0 19.4 15Z" /></>
    case "menu": return <><path d="M4 7h16M4 12h16M4 17h16" /></>
    case "more": return <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>
    case "sun": return <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>
    case "moon": return <path d="M20 14.8A8 8 0 0 1 9.2 4a8 8 0 1 0 10.8 10.8Z" />
    case "computer": return <><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></>
    case "external": return <><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>
    case "topup": return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /><path d="M17 13v4M15 15h4" /></>
    case "bank": return <><path d="M12 3 21 8v1.5H3V8Z" /><path d="M5.5 12v5.5M10 12v5.5M14 12v5.5M18.5 12v5.5" /><path d="M3 20.5h18" /></>
    case "cards": return <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19" /><path d="M6 14.5h4.5" /></>
    case "team": return <><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 14.2A5.2 5.2 0 0 1 21.2 19" /></>
    case "message": return <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5Z" /><path d="M8 9h8M8 12h5" /></>
    case "portfolio": return <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" /></>
    case "key": return <><circle cx="8" cy="15" r="4" /><path d="M11 12.5 20 4M16 8l3 3M14 10l2 2" /></>
    case "link": return <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>
    case "building": return <><path d="M6 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" /><path d="M14 10h4a1 1 0 0 1 1 1v10" /><path d="M9 8h.01M9 11h.01M9 14h.01M9 17h.01M17 14h.01M17 17h.01" /><path d="M3 21h18" /></>
  }
}

export function DashboardIcon({ name, ...props }: DashboardIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Glyph name={name} />
    </svg>
  )
}
