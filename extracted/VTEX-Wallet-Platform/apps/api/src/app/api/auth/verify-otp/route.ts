import { NextResponse } from "next/server"
import { appRouter } from "@vtex/router"
import { createFetchContext } from "@vtex/core/dist/api/context"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { userId, code, device } = await req.json() as { userId: number; code: string; device?: string }
    const ctx = await createFetchContext({ req, resHeaders: new Headers(), info: {} } as Parameters<typeof createFetchContext>[0])
    const { token } = await appRouter.createCaller(ctx).auth.verifyOtp({
      userId,
      code,
      device: device ?? "VTEX Wallet Web",
    })
    const response = NextResponse.json({ success: true })
    response.cookies.set("vtex_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Code invalide." }, { status: 400 })
  }
}
