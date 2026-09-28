import { createTRPCClient, httpBatchLink } from "@trpc/client"
import superjson from "superjson"
import type { AppRouter } from "@vtex/router"

/**
 * Le Dashboard utilise le même transport que le Wallet : les composants
 * clients appellent une URL même origine et le Route Handler injecte le
 * Bearer depuis le cookie httpOnly `vtex_session` côté serveur.
 */
export const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
    }),
  ],
})

/** Compatibilité d’API interne : la session ne doit plus être lisible par JS. */
export function getToken(): string | null {
  return null
}

export function setToken(_token: string) {
  // Le cookie est posé par /api/auth/verify-otp, jamais par localStorage.
}

export function clearToken() {
  void fetch("/api/auth/logout", { method: "POST" })
}
