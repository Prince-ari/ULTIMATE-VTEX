import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Contexte de la requête en cours, propagé à travers tous les `await` sans être passé en paramètre.
 * `logAction` le lit pour renseigner automatiquement, à chaque écriture du journal : rôle de l'acteur, session,
 * IP, identifiant de requête et — pendant une session support — l'identifiant de cette session.
 * Ainsi les ~150 appels existants à `logAction` deviennent traçables sans être modifiés.
 */
export interface RequestContext {
  requestId: string
  actorId: number | null
  actorRole: string | null
  sessionJti: string | null
  ip: string | null
  /** Renseigné uniquement par une session d'accès support (Sprint 8). */
  supportSessionId: number | null
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn)
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore()
}
