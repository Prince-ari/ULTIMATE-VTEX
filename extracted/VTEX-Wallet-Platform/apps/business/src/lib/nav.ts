/** Arborescence sidebar Business — 10 groupes, 33 destinations.
 *  L'ordre reproduit l'organisation validée avec le user (voir brief PRO). */

export type NavItem = {
  label: string
  href: string
  icon: IconName
  /** Modules branchés sur le vrai backend @vtex/business (badge "Live" dans la sidebar). */
  live?: boolean
}

export type NavGroup = {
  kicker: string
  items: NavItem[]
}

export type IconName =
  | "home"
  | "wallet"
  | "list"
  | "arrows"
  | "send"
  | "basket"
  | "link"
  | "button"
  | "pos"
  | "invoice"
  | "quote"
  | "cycle"
  | "orders"
  | "box"
  | "people"
  | "chart"
  | "chart-line"
  | "chart-user"
  | "file"
  | "flag"
  | "chargeback"
  | "shield"
  | "team"
  | "role"
  | "permissions"
  | "approve"
  | "key"
  | "apps"
  | "hook"
  | "sandbox"
  | "building"
  | "coins"
  | "lock"
  | "team-set"
  | "bell"
  | "plug"
  | "check"
  | "close"
  | "dot"
  | "plus"
  | "search"
  | "external"
  | "copy"
  | "download"
  | "eye"
  | "cog"

export const DASHBOARD_NAV: NavItem = {
  label: "Dashboard",
  href: "/",
  icon: "home",
}

export const NAV_GROUPS: NavGroup[] = [
  {
    kicker: "Finance",
    items: [
      { label: "Recharger", href: "/topup", icon: "plus", live: true },
      { label: "Wallet", href: "/wallet", icon: "wallet", live: true },
      { label: "Documents", href: "/documents", icon: "file", live: true },
      { label: "Transactions", href: "/transactions", icon: "list" },
      { label: "Transferts", href: "/transfers", icon: "arrows" },
      { label: "Payouts", href: "/payouts", icon: "send" },
    ],
  },
  {
    kicker: "Payments",
    items: [
      { label: "Checkout", href: "/checkout", icon: "basket" },
      { label: "Payment Links", href: "/payment-links", icon: "link", live: true },
      { label: "Payment Buttons", href: "/payment-buttons", icon: "button" },
      { label: "POS", href: "/pos", icon: "pos" },
    ],
  },
  {
    kicker: "Sales",
    items: [
      { label: "Invoices", href: "/invoices", icon: "invoice", live: true },
      { label: "Estimates", href: "/estimates", icon: "quote" },
      { label: "Subscriptions", href: "/subscriptions", icon: "cycle" },
      { label: "Orders", href: "/orders", icon: "orders" },
      { label: "Products", href: "/products", icon: "box" },
    ],
  },
  {
    kicker: "Customers",
    items: [{ label: "Customers", href: "/customers", icon: "people" }],
  },
  {
    kicker: "Analytics",
    items: [
      { label: "Overview", href: "/analytics", icon: "chart" },
      { label: "Sales", href: "/analytics/sales", icon: "chart-line" },
      { label: "Customers", href: "/analytics/customers", icon: "chart-user" },
      { label: "Reports", href: "/reports", icon: "file" },
    ],
  },
  {
    kicker: "Resolution",
    items: [
      { label: "Disputes", href: "/disputes", icon: "flag" },
      { label: "Chargebacks", href: "/chargebacks", icon: "chargeback" },
      { label: "Risk", href: "/risk", icon: "shield" },
    ],
  },
  {
    kicker: "Team",
    items: [
      { label: "Users", href: "/team/users", icon: "team", live: true },
      { label: "Roles", href: "/team/roles", icon: "role" },
      { label: "Permissions", href: "/team/permissions", icon: "permissions" },
      { label: "Approvals", href: "/team/approvals", icon: "approve" },
    ],
  },
  {
    kicker: "Developers",
    items: [
      { label: "API Keys", href: "/developers/api", icon: "key" },
      { label: "Applications", href: "/developers/apps", icon: "apps" },
      { label: "Webhooks", href: "/developers/webhooks", icon: "hook" },
      { label: "Sandbox", href: "/developers/sandbox", icon: "sandbox" },
    ],
  },
  {
    kicker: "Settings",
    items: [
      { label: "Business", href: "/settings/business", icon: "building" },
      { label: "Finance", href: "/settings/finance", icon: "coins" },
      { label: "Security", href: "/settings/security", icon: "lock" },
      { label: "Team", href: "/settings/team", icon: "team-set" },
      { label: "Notifications", href: "/settings/notifications", icon: "bell" },
      { label: "Integrations", href: "/settings/integrations", icon: "plug" },
    ],
  },
]

/** Aplatit toutes les destinations en une liste de hrefs (utilitaire routing). */
export function allHrefs(): string[] {
  return [DASHBOARD_NAV.href, ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))]
}
