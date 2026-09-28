import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Resolution"
      title="Chargebacks"
      description="Rétrofacturation carte : gestion active, contestation, catégorisation."
      icon="chargeback"
      phase="3"
      outline={[
    "Liste chargebacks entrants",
    "Détail transaction contestée",
    "Contestation à l'acquéreur",
    "Suivi statut réseau (Visa / MC)",
    "Taux de succès et coût cumulé",
    "Rapport mensuel",
      ]}
    />
  )
}