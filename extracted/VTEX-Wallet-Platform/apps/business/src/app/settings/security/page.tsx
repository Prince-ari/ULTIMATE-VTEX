import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Settings"
      title="Sécurité"
      description="Deux facteurs, sessions, appareils, alertes de connexion inhabituelles."
      icon="lock"
      phase="2"
      outline={[
    "2FA (TOTP / passkey / SMS)",
    "Sessions actives + révocation",
    "Appareils enregistrés",
    "Alertes connexion inhabituelle",
    "IP allowlist / denylist",
    "Journal connexions",
      ]}
    />
  )
}