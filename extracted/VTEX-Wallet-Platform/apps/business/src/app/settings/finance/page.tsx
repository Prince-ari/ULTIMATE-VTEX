import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Settings"
      title="Finance"
      description="Comptes bancaires, devises acceptées, préférences d'encaissement et de payout."
      icon="coins"
      phase="2"
      outline={[
    "Devises acceptées + devise par défaut",
    "Comptes bancaires liés (IBAN / SWIFT)",
    "Fréquence des payouts",
    "Frais et grille tarifaire",
    "Documents comptables mensuels",
    "Note aux clients sur les reçus",
      ]}
    />
  )
}