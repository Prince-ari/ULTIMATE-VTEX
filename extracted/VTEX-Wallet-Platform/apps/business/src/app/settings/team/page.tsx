import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Settings"
      title="Équipe"
      description="Réglages transverses de l'équipe : politique de mot de passe, SSO, rôles personnalisés."
      icon="team-set"
      phase="2"
      outline={[
    "Politique mot de passe",
    "SSO (Google / Microsoft / SAML)",
    "Rôles personnalisés",
    "Provisioning automatique",
    "Suspension par défaut sur inactivité",
    "Off-boarding checklist",
      ]}
    />
  )
}