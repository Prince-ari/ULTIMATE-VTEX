import type { BadgeVariant } from "@/lib/adminFormat"

/**
 * Détermine la variante de badge à appliquer à une variation chiffrée
 * (ex: +12% -> success, -60% -> warning, -5% -> error). Utilitaire
 * générique consommé par LineChart.tsx — extrait de l'ancien
 * DashboardChartCard.tsx (démo Tremor) lors du nettoyage de l'étape
 * "Dashboard" du Sprint 8, car il n'a rien de spécifique à cette
 * ancienne page et est consommé par un composant de bas niveau.
 */
export function getBadgeType(value: number): BadgeVariant {
  if (value > 0) return "success"
  if (value < 0) return value < -50 ? "warning" : "error"
  return "neutral"
}
