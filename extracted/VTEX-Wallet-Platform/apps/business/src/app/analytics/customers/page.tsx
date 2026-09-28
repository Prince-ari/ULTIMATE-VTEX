import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Analytics"
      title="Analytics · Clients"
      description="Focus base clients : acquisition, rétention, cohortes, valeur vie client."
      icon="chart-user"
      phase="3"
      outline={[
    "Nouveaux vs récurrents par mois",
    "Cohortes de rétention",
    "Valeur vie client (LTV)",
    "Churn et raisons",
    "Top clients par revenu",
    "Segmentation dynamique",
      ]}
    />
  )
}