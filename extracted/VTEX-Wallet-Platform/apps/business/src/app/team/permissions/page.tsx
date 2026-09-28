import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Team"
      title="Permissions"
      description="Contrôle fin : surcharger la permission d'un membre au-delà du rôle par défaut."
      icon="permissions"
      phase="2"
      outline={[
    "Permissions atomiques (voir / envoyer / créer / approuver…)",
    "Vue par module",
    "Surcharge par membre",
    "Explication du 'pourquoi' d'un refus",
    "Simulation : que peut faire ce membre ?",
    "Audit modif permissions",
      ]}
    />
  )
}