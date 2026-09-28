export const siteConfig = {
  // Nom/description provisoires — la charte graphique définitive (logo, couleurs)
  // reste à formaliser avant le travail visuel (cf. Sprint 2 §15).
  name: "VTEX Core Control Center",
  url: "https://admin.vtex.app",
  description: "Centre d’administration du socle VTEX Core.",
  baseLinks: {
    home: "/",
    users: "/utilisateurs",
    leads: "/leads",
    notifications: "/notifications",
    analytics: "/analytics",
    wallets: "/wallets",
    business: "/business",
    cards: "/cartes",
    banking: "/banque",
    topups: "/recharges",
    paymentLinks: "/liens-de-paiement",
    apiKeys: "/cles-api",
    managers: "/gestionnaires",
    suggestions: "/suggestions",
    portfolio: "/portefeuille",
    documents: "/documents",
    support: "/support",
    journal: "/journal",
    settings: "/parametres",
  },
}

export type siteConfig = typeof siteConfig
