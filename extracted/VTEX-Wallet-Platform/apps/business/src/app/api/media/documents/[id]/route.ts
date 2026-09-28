const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
const SESSION_COOKIE = "vtex_business_session"
export const runtime = "nodejs"

/** En-têtes de sécurité que le serveur d'API impose à un document : ils doivent arriver tels quels au navigateur. */
const PASSTHROUGH = ["content-type", "content-disposition", "cache-control", "x-content-type-options", "content-security-policy", "cross-origin-resource-policy"]

function parseCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? ""
  const match = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))
  return match?.slice(name.length + 1)
}

/**
 * Téléchargement d'un document remis à l'entreprise. Le navigateur n'a que le cookie de session Wallet Pro : ce relais le transforme en jeton
 * pour le serveur d'API, qui vérifie le droit (destinataire actif), journalise l'ouverture et sert le fichier. Rien n'est mis en cache ici.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!/^\d{1,12}$/.test(params.id)) return new Response("Document introuvable.", { status: 404 })
  const token = parseCookie(req, SESSION_COOKIE)
  if (!token) return new Response("Session requise.", { status: 401 })

  const headers = new Headers({ authorization: `Bearer ${token}` })
  const forwardedFor = req.headers.get("x-forwarded-for")
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor)

  const upstream = await fetch(`${API_URL.replace(/\/$/, "")}/api/media/documents/${params.id}`, { headers, cache: "no-store" })
  const forwarded = new Headers()
  for (const name of PASSTHROUGH) {
    const value = upstream.headers.get(name)
    if (value) forwarded.set(name, value)
  }
  forwarded.set("cache-control", "private, no-store")
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: forwarded })
}
