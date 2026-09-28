import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Sales"
      title="Produits et catalogue"
      description="Ce que ton entreprise vend. Utilisable dans Payment Links, factures, checkout."
      icon="box"
      phase="2"
      outline={[
    "Fiche produit (nom, description, image, SKU)",
    "Prix multi-devises",
    "Catégories et tags",
    "Stock avec seuils d'alerte",
    "Statut actif / inactif / brouillon",
    "Import CSV du catalogue",
      ]}
    />
  )
}