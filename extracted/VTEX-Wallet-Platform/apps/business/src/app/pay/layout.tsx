import type { Metadata } from "next"

/** Page publique : jamais indexée, et l'adresse du lien (qui identifie le paiement) n'est pas transmise aux sites tiers. */
export const metadata: Metadata = {
  title: "Paiement sécurisé — VTEX",
  description: "Réglez ce paiement par carte bancaire. Aucun compte n'est nécessaire.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children
}
