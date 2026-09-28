import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Customers"
      title="CRM Clients"
      description="Vue 360° par client : coordonnées, transactions, factures, abonnements, litiges, activité."
      icon="people"
      phase="2"
      outline={[
    "Fiche client complète",
    "Historique unifié transactions + factures",
    "Notes internes équipe",
    "Segments et tags",
    "Import / merge de doublons",
    "Export contact vers CRM externe",
      ]}
    />
  )
}