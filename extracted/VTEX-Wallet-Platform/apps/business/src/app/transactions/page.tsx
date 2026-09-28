import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Finance"
      title="Transactions"
      description="Historique unifié : encaissements, sorties, refunds, payouts, ajustements. Filtres serveur, export CSV/PDF."
      icon="list"
      phase="2"
      outline={[
    "Liste paginée serveur",
    "Filtres période / devise / type / statut",
    "Détail transaction (drawer)",
    "Refund direct depuis la ligne",
    "Regroupement par jour / semaine / mois",
    "Export CSV et PDF",
      ]}
    />
  )
}