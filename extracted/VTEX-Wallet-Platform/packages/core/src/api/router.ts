import { authRouter } from "./routers/auth"
import { usersRouter } from "./routers/users"
import { notificationsRouter } from "./routers/notifications"
import { leadsRouter } from "./routers/leads"
import { analyticsRouter } from "./routers/analytics"
import { settingsRouter } from "./routers/settings"
import { supportRouter } from "./routers/support"
import { journalRouter } from "./routers/journal"
import { documentsRouter } from "./routers/documents"
import { configRouter } from "./routers/config"
import { router } from "./trpc"

/**
 * Routeur du noyau générique : identité, comptes, notifications, leads,
 * analytics générique, paramètres, support et journal. Il ne connaît aucun
 * domaine financier et peut être composé par n'importe quel futur produit.
 */
export const coreRouter = router({
  auth: authRouter,
  users: usersRouter,
  notifications: notificationsRouter,
  leads: leadsRouter,
  analytics: analyticsRouter,
  settings: settingsRouter,
  support: supportRouter,
  journal: journalRouter,
  documents: documentsRouter,
  config: configRouter,
})

export type CoreRouter = typeof coreRouter
