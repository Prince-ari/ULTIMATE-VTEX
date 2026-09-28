import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Payments"
      title="Payment Buttons"
      description="Bouton HTML à copier-coller sur un site pour déclencher un paiement en 2 clics."
      icon="button"
      phase="3"
      outline={[
    "Générateur de snippet HTML",
    "Options : montant fixe ou libre",
    "Devise et description par bouton",
    "Prévisualisation live",
    "Stats clics / conversions",
    "Personnalisation style",
      ]}
    />
  )
}