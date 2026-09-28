import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Resolution"
      title="Litiges"
      description="Contestations clients : deadlines, pièces justificatives, réponse, décision."
      icon="flag"
      phase="3"
      outline={[
    "Dashboard : ouverts / en attente / résolus / perdus",
    "Fiche litige : transaction, client, motif, deadline",
    "Messagerie interne avec le client",
    "Upload pièces justificatives",
    "Réponse structurée à l'acquéreur",
    "Historique décisions",
      ]}
    />
  )
}