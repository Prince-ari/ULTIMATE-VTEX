import { NextResponse } from "next/server"
import { appRouter } from "@vtex/router"
import { createFetchContext } from "@vtex/core/dist/api/context"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const ctx = await createFetchContext({ req, resHeaders: new Headers(), info: {} } as Parameters<typeof createFetchContext>[0])
  await appRouter.createCaller(ctx).auth.logout()
  const response = NextResponse.json({ success: true })
  response.cookies.set("vtex_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 })
  return response
}
