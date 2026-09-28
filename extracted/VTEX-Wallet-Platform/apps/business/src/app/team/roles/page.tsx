import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Team"
      title="Rôles"
      description="Définit qui peut faire quoi. Owner, Admin, Finance, Support, Viewer — ou rôles personnalisés."
      icon="role"
      phase="2"
      outline={[
    "Vue matrice rôle × permission",
    "Créer un rôle personnalisé",
    "Cloner + adapter un rôle existant",
    "Nombre de membres par rôle",
    "Historique des changements",
    "Rôles verrouillés (Owner protégé)",
      ]}
    />
  )
}