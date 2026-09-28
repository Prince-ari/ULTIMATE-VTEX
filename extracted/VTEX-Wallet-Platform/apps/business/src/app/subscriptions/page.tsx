import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Sales"
      title="Abonnements"
      description="Facturation récurrente automatique : plans, cycles, période d'essai, relances de paiement échoué."
      icon="cycle"
      phase="2"
      outline={[
    "Créer un plan (nom, prix, fréquence)",
    "Période d'essai + renouvellement auto",
    "Suspension / annulation / réactivation",
    "Relances paiement échoué (dunning)",
    "Dashboard MRR / churn",
    "Migration de plan sans réabonnement",
      ]}
    />
  )
}