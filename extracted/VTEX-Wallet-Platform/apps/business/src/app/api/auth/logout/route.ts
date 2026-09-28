import { NextResponse } from "next/server"
import { createApiClient, SESSION_COOKIE } from "@/lib/serverApi"

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") ?? ""
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1)
  if (token) {
    try {
      await createApiClient(token).auth.logout.mutate()
    } catch {
      // La suppression locale reste prioritaire si la session distante est déjà expirée.
    }
  }
  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 })
  return response
}
