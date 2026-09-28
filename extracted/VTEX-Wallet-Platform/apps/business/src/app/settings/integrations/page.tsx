import { ModuleStub } from "@/components/shell/ModuleStub"

export default function Page() {
  return (
    <ModuleStub
      kicker="Settings"
      title="Intégrations"
      description="Applications externes connectées : comptabilité, CRM, e-commerce, chat, storage."
      icon="plug"
      phase="3"
      outline={[
    "Marketplace d'intégrations",
    "Comptabilité (QuickBooks, Xero, Sage)",
    "E-commerce (Shopify, WooCommerce)",
    "CRM (HubSpot, Pipedrive)",
    "Chat (Slack, Teams)",
    "Storage documents (Drive, Dropbox)",
      ]}
    />
  )
}