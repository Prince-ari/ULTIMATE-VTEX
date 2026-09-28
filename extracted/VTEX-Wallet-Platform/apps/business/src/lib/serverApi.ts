import { createTRPCClient, httpBatchLink } from "@trpc/client"
import superjson from "superjson"
import type { AppRouter } from "@vtex/router"

export const SESSION_COOKIE = "vtex_business_session"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

export function createApiClient(token?: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL.replace(/\/$/, "")}/api/trpc`,
        transformer: superjson,
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      }),
    ],
  })
}
