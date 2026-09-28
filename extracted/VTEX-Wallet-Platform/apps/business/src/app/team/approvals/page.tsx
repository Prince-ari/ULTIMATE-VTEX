import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Team"
      title="Approvals"
      description="Workflow d'approbation obligatoire : Finance crée → Admin approuve → exécution."
      icon="approve"
      phase="3"
      outline={[
    "Règles par montant / type / bénéficiaire",
    "File des demandes en attente",
    "Approbation en 1 clic + note",
    "Rejet motivé + notification",
    "Escalade automatique après délai",
    "Historique des approbations",
      ]}
    />
  )
}