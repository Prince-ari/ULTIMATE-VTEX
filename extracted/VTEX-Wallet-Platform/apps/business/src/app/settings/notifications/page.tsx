import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Settings"
      title="Notifications"
      description="Ce que ton équipe reçoit par email, push, SMS. Alertes financières incluses."
      icon="bell"
      phase="2"
      outline={[
    "Par canal : email, push, SMS",
    "Par catégorie : paiement, facture, litige, sécurité",
    "Par membre : préférences individuelles",
    "Digest quotidien / hebdo",
    "Alertes financières (seuil solde, dépense)",
    "Test d'envoi",
      ]}
    />
  )
}