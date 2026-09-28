import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Sales"
      title="Commandes"
      description="La commande commerciale, séparée de la transaction financière : catalogue, quantités, livraison, statut."
      icon="orders"
      phase="3"
      outline={[
    "Nouvelle commande manuelle",
    "Ligne produits + quantités + remises",
    "Sous-total / taxe / livraison / total",
    "Statuts : nouvelle / payée / préparée / expédiée / livrée",
    "Rattachement facture + transaction",
    "Notes internes + tags",
      ]}
    />
  )
}