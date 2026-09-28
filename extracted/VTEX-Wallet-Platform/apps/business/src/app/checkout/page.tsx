import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Payments"
      title="Checkout hébergé"
      description="Vraie page de paiement hébergée VTEX, intégrable dans ton site ou app par redirection."
      icon="basket"
      phase="3"
      outline={[
    "Configuration produits / lignes",
    "Devises et méthodes de paiement",
    "Adresse de livraison + taxes",
    "URL de redirection succès / échec",
    "Personnalisation logo & couleurs (via Settings)",
    "Webhook de confirmation",
      ]}
    />
  )
}