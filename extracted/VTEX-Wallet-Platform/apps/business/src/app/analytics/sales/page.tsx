import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Analytics"
      title="Analytics · Ventes"
      description="Focus commercial : CA par produit, entonnoir, panier moyen, saisonnalité."
      icon="chart-line"
      phase="3"
      outline={[
    "Revenu par produit et par catégorie",
    "Panier moyen par période",
    "Entonnoir de conversion",
    "Comparaison canal (checkout / lien / POS)",
    "Saisonnalité et tendances",
    "Prévisions simples",
      ]}
    />
  )
}