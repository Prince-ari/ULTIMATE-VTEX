const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
const SESSION_COOKIE = "vtex_session"
export const runtime = "nodejs"

function parseCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? ""
  const match = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))
  return match?.slice(name.length + 1)
}

async function proxy(req: Request, path: string): Promise<Response> {
  const token = parseCookie(req, SESSION_COOKIE)
  const url = new URL(req.url)
  const target = `${API_URL.replace(/\/$/, "")}/api/trpc/${path}${url.search}`
  const headers = new Headers({ "content-type": "application/json" })
  if (token) headers.set("authorization", `Bearer ${token}`)
  // Adresse réelle du client (ajoutée à droite par le proxy de bordure) : sans elle, tous les visiteurs partageraient l'IP de ce serveur pour les limiteurs de débit.
  const forwardedFor = req.headers.get("x-forwarded-for")
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor)

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
    cache: "no-store",
  })

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  })
}

export async function GET(req: Request, { params }: { params: { trpc: string } }) {
  return proxy(req, params.trpc)
}

export async function POST(req: Request, { params }: { params: { trpc: string } }) {
  return proxy(req, params.trpc)
}
