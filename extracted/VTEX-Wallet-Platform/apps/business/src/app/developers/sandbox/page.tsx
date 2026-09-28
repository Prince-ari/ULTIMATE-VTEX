import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Developers"
      title="Sandbox"
      description="Environnement isolé pour tester l'intégration sans toucher les données réelles."
      icon="sandbox"
      phase="3"
      outline={[
    "Compte sandbox indépendant",
    "Cartes de test acceptées / refusées",
    "Simulateur d'événements",
    "Reset données 1-click",
    "Logs API détaillés",
    "Bascule Sandbox / Production",
      ]}
    />
  )
}