import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import "./legday.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700", "800"],
})

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["500", "600", "700"],
})

import { ToastProvider } from "@/components/admin/Toast"
import { siteConfig } from "./siteConfig"

export const metadata: Metadata = {
  // metadataBase à mettre à jour avec le domaine réel une fois confirmé
  // (admin.vtex.app pressenti, cf. siteConfig.ts).
  metadataBase: new URL(siteConfig.url),
  title: siteConfig.name,
  description: siteConfig.description,
  keywords: [],
  creator: "VTEX",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: siteConfig.url,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${inter.className} ${jetbrains.variable} overflow-y-scroll scroll-auto antialiased selection:bg-indigo-100 selection:text-indigo-900 dark:bg-gray-950`}
        suppressHydrationWarning
      >
        <div className="mx-auto max-w-screen-2xl">
          <ThemeProvider defaultTheme="light" forcedTheme="light" enableSystem={false} attribute="class">
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  )
}
