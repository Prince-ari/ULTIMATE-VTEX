import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Sales"
      title="Devis"
      description="Proposition commerciale envoyée avant la facture. Conversion automatique en facture après acceptation."
      icon="quote"
      phase="2"
      outline={[
    "Composer devis (produits, remise, taxe, validité)",
    "Envoi PDF au client",
    "Statuts : envoyé / accepté / refusé",
    "Conversion 1-click en facture",
    "Renouvellement sur devis expiré",
    "Signature électronique (Phase 4)",
      ]}
    />
  )
}