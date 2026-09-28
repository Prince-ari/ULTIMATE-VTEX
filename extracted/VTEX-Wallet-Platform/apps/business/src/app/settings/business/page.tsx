import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Settings"
      title="Profil entreprise"
      description="L'identité légale et commerciale de ton entreprise. Toutes les factures, transactions et communications s'y rattachent."
      icon="building"
      phase="1"
      outline={[
    "Nom légal + nom commercial",
    "Logo, secteur, description",
    "Adresse, téléphone, email pro",
    "SIREN / SIRET / TVA / infos fiscales",
    "Statut de vérification KYB",
    "Profil public commercial partageable",
      ]}
    />
  )
}