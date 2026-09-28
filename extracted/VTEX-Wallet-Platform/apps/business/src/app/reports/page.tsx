import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Analytics"
      title="Reporting"
      description="Rapports exploitables : transactions, revenus, frais, refunds, litiges, payouts, factures, clients."
      icon="file"
      phase="3"
      outline={[
    "Rapports pré-configurés",
    "Filtres période / devise / statut / type / client",
    "Rapports personnalisés sauvegardés",
    "Export CSV / PDF / Excel",
    "Planification et envoi email",
    "Archive téléchargeable",
      ]}
    />
  )
}