import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Finance"
      title="Payouts et paiements de masse"
      description="Payer collaborateurs, fournisseurs, partenaires. Un-à-un ou lot importé. Approbation obligatoire au-delà d'un seuil."
      icon="send"
      phase="3"
      outline={[
    "Payout individuel (bénéficiaire + montant + motif)",
    "Import CSV / Excel pour paiement de masse",
    "Prévisualisation avant envoi",
    "Workflow d'approbation configurable",
    "Reprise en cas d'échec partiel",
    "Journal d'audit par ligne",
      ]}
    />
  )
}