export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export type BadgeVariant = "default" | "neutral" | "success" | "error" | "warning"

/**
 * Mapping unique statut -> variante de badge, partagé par tous les modules,
 * pour qu'un rouge/vert/gris veuille toujours dire la même chose sur tout
 * le Dashboard (Sprint 2 §0 principe 1 : une seule façon de faire chaque chose).
 */
export const STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "success",
  validated: "success",
  sent: "success",
  resolved: "success",
  converted: "success",
  suspended: "warning",
  frozen: "warning",
  pending: "warning",
  in_progress: "warning",
  scheduled: "warning",
  open: "error",
  blocked: "error",
  rejected: "error",
  deleted: "neutral",
  lost: "neutral",
  draft: "neutral",
  new: "default",
  contacted: "default",
  qualified: "default",
}

export const STATUS_LABEL: Record<string, string> = {
  active: "Actif",
  suspended: "Suspendu",
  deleted: "Supprimé",
  frozen: "Gelée",
  blocked: "Bloquée",
  physical: "Physique",
  virtual: "Virtuelle",
  visa: "Visa",
  mastercard: "Mastercard",
  pending: "En attente",
  validated: "Validée",
  rejected: "Rejetée",
  new: "Nouveau",
  contacted: "Contacté",
  qualified: "Qualifié",
  converted: "Converti",
  lost: "Perdu",
  draft: "Brouillon",
  scheduled: "Programmée",
  sent: "Envoyée",
  open: "Ouvert",
  in_progress: "En cours",
  resolved: "Résolu",
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  super_admin: "Super-administrateur",
  admin: "Administrateur",
  account_manager: "Gestionnaire de compte",
  agent: "Support",
  user: "Utilisateur",
  // Types de transaction (Sprint 6 §5) — absents jusqu'ici, la page
  // Transactions affichait la valeur brute de l'enum sans traduction.
  transfer: "Virement",
  card_payment: "Paiement carte",
  deposit: "Dépôt",
  adjustment: "Ajustement",
  // Catégories de transaction (Sprint 6 §5).
  alimentation: "Alimentation",
  transport: "Transport",
  loisirs: "Loisirs",
  abonnements: "Abonnements",
  logement: "Logement",
  revenus: "Revenus",
  p2p: "P2P",
  compte: "Compte",
  autres: "Autres",
  // Thème (Sprint 6 §9).
  light: "Clair",
  dark: "Sombre",
}
