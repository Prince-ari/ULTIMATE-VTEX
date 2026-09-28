"use client"
"use client"

import { siteConfig } from "@/app/siteConfig"
import { cx, focusRing } from "@/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { navVisible } from "@/lib/roles"
import { useSession } from "@/lib/session"
import type { ComponentProps } from "react"
import { DashboardIcon, type DashboardIconName } from "./DashboardIcon"
import MobileSidebar from "./MobileSidebar"
import { UserProfileDesktop, UserProfileMobile } from "./UserProfile"

const VTEX_WORDMARK_URL = "/brand/vtex-logo.png"

function createNavigationIcon(name: DashboardIconName) {
  return function NavigationIcon(props: ComponentProps<"svg">) {
    return <DashboardIcon {...props} name={name} />
  }
}

const HomeIcon = createNavigationIcon("home")
const UserIcon = createNavigationIcon("user")
const WalletIcon = createNavigationIcon("wallet")
const BusinessIcon = createNavigationIcon("building")
const CardsIcon = createNavigationIcon("cards")
const BankIcon = createNavigationIcon("bank")
const TopupIcon = createNavigationIcon("topup")
const LinkIcon = createNavigationIcon("link")
const KeyIcon = createNavigationIcon("key")
const TeamIcon = createNavigationIcon("team")
const MessageIcon = createNavigationIcon("message")
const PortfolioIcon = createNavigationIcon("portfolio")
const FolderIcon = createNavigationIcon("folder")
const UserAddIcon = createNavigationIcon("user-add")
const BellIcon = createNavigationIcon("bell")
const AnalyticsIcon = createNavigationIcon("analytics")
const SupportIcon = createNavigationIcon("support")
const FileIcon = createNavigationIcon("file")
const SettingsIcon = createNavigationIcon("settings")

// Navigation des modules transversaux du Core.
export const navigation = [
  { name: "Portefeuille", href: siteConfig.baseLinks.portfolio, icon: PortfolioIcon },
  { name: "Accueil", href: siteConfig.baseLinks.home, icon: HomeIcon },
  { name: "Utilisateurs", href: siteConfig.baseLinks.users, icon: UserIcon },
  { name: "Wallets", href: siteConfig.baseLinks.wallets, icon: WalletIcon },
  { name: "Wallet Pro", href: siteConfig.baseLinks.business, icon: BusinessIcon },
  { name: "Cartes", href: siteConfig.baseLinks.cards, icon: CardsIcon },
  { name: "Banque", href: siteConfig.baseLinks.banking, icon: BankIcon },
  { name: "Recharges", href: siteConfig.baseLinks.topups, icon: TopupIcon },
  { name: "Liens de paiement", href: siteConfig.baseLinks.paymentLinks, icon: LinkIcon },
  { name: "Clés API", href: siteConfig.baseLinks.apiKeys, icon: KeyIcon },
  { name: "Gestionnaires", href: siteConfig.baseLinks.managers, icon: TeamIcon },
  { name: "Suggestions", href: siteConfig.baseLinks.suggestions, icon: MessageIcon },
  { name: "Documents", href: siteConfig.baseLinks.documents, icon: FolderIcon },
  { name: "Leads", href: siteConfig.baseLinks.leads, icon: UserAddIcon },
  {
    name: "Notifications",
    href: siteConfig.baseLinks.notifications,
    icon: BellIcon,
  },
  {
    name: "Analytics",
    href: siteConfig.baseLinks.analytics,
    icon: AnalyticsIcon,
  },
] as const

// Groupe secondaire, séparé visuellement (Sprint 2 §2 nav globale).
export const secondaryNavigation = [
  {
    name: "Support",
    href: siteConfig.baseLinks.support,
    icon: SupportIcon,
  },
  {
    name: "Journal système",
    href: siteConfig.baseLinks.journal,
    icon: FileIcon,
  },
  {
    name: "Paramètres",
    href: siteConfig.baseLinks.settings,
    icon: SettingsIcon,
  },
] as const

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

function NavList({ pathname }: { pathname: string }) {
  const role = useSession()?.role ?? null
  const items = navigation.filter((item) => navVisible(role, item.href))
  return (
    <>
      <ul role="list" className="space-y-0.5">
        {items.map((item) => (
          <li key={item.name}>
            <Link
              href={item.href}
              className={cx(
                isActivePath(pathname, item.href) ? "vtex-dashboard-nav-link is-active" : "vtex-dashboard-nav-link",
                "flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition hover:bg-gray-100 hover:dark:bg-gray-900",
                focusRing,
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
      {role === "account_manager" ? null : <div>
        <span className="vtex-dashboard-nav-section mb-1 block px-2 text-xs font-medium">
          Système
        </span>
        <ul role="list" className="space-y-0.5">
          {secondaryNavigation.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className={cx(
                  isActivePath(pathname, item.href) ? "vtex-dashboard-nav-link is-active" : "vtex-dashboard-nav-link",
                  "flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition hover:bg-gray-100 hover:dark:bg-gray-900",
                  focusRing,
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>}
    </>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  return (
    <>
      {/* sidebar (lg+) */}
      <nav className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-[292px] lg:flex-col">
        <aside className="vtex-dashboard-shell flex grow flex-col gap-y-6 overflow-y-auto p-4">
          <div className="px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="vtex-dashboard-brand-lockup">
              <img src={VTEX_WORDMARK_URL} alt="VTEX" className="vtex-dashboard-wordmark" />
              <span>Dashboard</span>
            </div>
          </div>
          <nav
            aria-label="core navigation links"
            className="flex flex-1 flex-col space-y-6"
          >
            <NavList pathname={pathname} />
          </nav>
          <div className="mt-auto">
            <UserProfileDesktop />
          </div>
        </aside>
      </nav>
      {/* top navbar (xs-lg) */}
      <div className="vtex-dashboard-mobile-bar sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between px-4 sm:gap-x-6 lg:hidden">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="vtex-dashboard-brand-lockup vtex-dashboard-brand-lockup-compact">
            <img src={VTEX_WORDMARK_URL} alt="VTEX" className="vtex-dashboard-wordmark" />
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <UserProfileMobile />
          <MobileSidebar />
        </div>
      </div>
    </>
  )
}
