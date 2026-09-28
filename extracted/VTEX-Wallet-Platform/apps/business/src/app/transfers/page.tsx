import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Finance"
      title="Transferts internes"
      description="Déplacer des fonds entre comptes wallet de la même entreprise : devise, sous-compte, entité juridique."
      icon="arrows"
      phase="2"
      outline={[
    "Sélection compte source / destination",
    "Support multi-devises",
    "Motif + note interne",
    "Réservation puis exécution atomique",
    "Idempotence stricte (rejeu bloqué)",
    "Journal audit obligatoire",
      ]}
    />
  )
}