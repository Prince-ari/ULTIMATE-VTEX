import { NextResponse } from "next/server"

import { createApiClient, SESSION_COOKIE } from "@/lib/serverApi"

export async function POST(req: Request) {
  const { userId, code } = await req.json() as { userId: number; code: string }
  try {
    const { token } = await createApiClient().auth.verifyOtp.mutate({ userId, code, device: "VTEX Business Web" })
    const response = NextResponse.json({ success: true })
    response.cookies.set(SESSION_COOKIE, token, {
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
