import type { Metadata } from "next"
import "./globals.css"
import { BusinessShell } from "@/components/shell/BusinessShell"

export const metadata: Metadata = {
  title: "VTEX Business — Espace financier professionnel",
  description:
    "Console professionnelle VTEX : encaissements, facturation, équipe, analytics et opérations financières pour ton entreprise.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body>
        <BusinessShell>{children}</BusinessShell>
      </body>
    </html>
  )
}
