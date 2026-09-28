import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Analytics"
      title="Overview analytics"
      description="Vision d'ensemble de la santé du business : revenus, transactions, clients, produits."
      icon="chart"
      phase="3"
      outline={[
    "CA net + brut + évolution",
    "Volume transactions et taux de réussite",
    "Nouveaux vs récurrents clients",
    "Top produits par volume et par revenus",
    "Graphiques jour / semaine / mois / trimestre / année",
    "Comparaison période N vs N-1",
      ]}
    />
  )
}