import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Payments"
      title="POS · Paiement physique"
      description="Terminal, Tap-to-Pay, lecteur carte. Encaissement en présence physique du client."
      icon="pos"
      phase="4"
      outline={[
    "Liste terminaux enregistrés",
    "Association Tap-to-Pay (iOS / Android)",
    "Transaction physique + reçu",
    "Remboursement direct depuis terminal",
    "Historique POS filtrable",
    "Réconciliation avec dashboard",
      ]}
    />
  )
}