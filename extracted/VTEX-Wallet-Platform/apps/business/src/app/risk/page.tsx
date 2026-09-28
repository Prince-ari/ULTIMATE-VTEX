import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Resolution"
      title="Risk et fraude"
      description="Détection automatique des transactions suspectes : signaux, score, action."
      icon="shield"
      phase="4"
      outline={[
    "Score de risque par transaction (Low / Medium / High)",
    "Signaux : montant, fréquence, localisation, device, comportement",
    "Actions : autoriser / bloquer / demander vérification",
    "Règles personnalisées",
    "Historique décisions et audit",
    "Alertes en temps réel",
      ]}
    />
  )
}