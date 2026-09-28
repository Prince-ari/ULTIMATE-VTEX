import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { createServer, request as httpRequest } from "node:http"
import { extname, join, normalize } from "node:path"

const port = Number(process.env.PORT ?? process.env.WALLET_PORT ?? 3002)
const root = process.cwd()
const apiProxyUrl = process.env.API_PROXY_URL ? new URL(process.env.API_PROXY_URL) : null
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
}
const previewStaticAssets = new Map([
  ["/manus-storage/vtex-wallet-entry-background_e38435b7.mp4", "/home/ubuntu/webdev-static-assets/vtex-wallet-entry-background.mp4"],
  ["/manus-storage/vtex-wallet-entry-background_dbf85532.jpg", "/home/ubuntu/webdev-static-assets/vtex-wallet-entry-background.jpg"],
])

createServer((req, res) => {
  const requestUrl = new URL(req.url ?? "/", "http://localhost")
  const requestPath = requestUrl.pathname
  const previewAsset = process.env.NODE_ENV !== "production" ? previewStaticAssets.get(requestPath) : undefined
  if (previewAsset && existsSync(previewAsset)) {
    res.writeHead(200, {
      "cache-control": "public, max-age=3600",
      "content-type": mimeTypes[extname(previewAsset)] ?? "application/octet-stream",
    })
    createReadStream(previewAsset).pipe(res)
    return
  }
  if (requestPath.startsWith("/api/")) {
    if (!apiProxyUrl) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" })
      res.end("API proxy is not configured")
      return
    }
    const upstream = new URL(req.url ?? "/", apiProxyUrl)
    const proxy = httpRequest({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      path: `${upstream.pathname}${upstream.search}`,
      method: req.method,
      headers: { ...req.headers, host: upstream.host },
    }, (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(res)
    })
    proxy.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" })
      res.end("API proxy unavailable")
    })
    req.pipe(proxy)
    return
  }
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "")
  const target = normalize(join(root, relativePath))

  const missing = !target.startsWith(root) || !existsSync(target) || statSync(target).isDirectory()
  if (missing) {
    /* Fallback SPA : le routeur navigateur (History API) attend qu'un
       rafraîchissement ou un lien direct sur /cartes, /historique, etc.
       renvoie l'application. On n'accepte le repli que pour une méthode GET,
       hors /api/ et sans extension de fichier — un asset absent doit rester
       un 404 propre pour ne pas masquer les vraies erreurs. */
    const looksLikeNavigation = req.method === "GET" && !extname(requestPath) && !requestPath.startsWith("/api/")
    const indexTarget = join(root, "index.html")
    if (looksLikeNavigation && existsSync(indexTarget)) {
      res.writeHead(200, { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" })
      createReadStream(indexTarget).pipe(res)
      return
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    res.end("Not found")
    return
  }

  const previewView = requestUrl.searchParams.get("preview")
  const previewViews = new Set(["login", "otp", "accueil", "recu", "cartes", "profil", "confidentialite", "support", "email-compose", "banque", "recevoir", "historique", "notifications", "envoyer", "beneficiaires", "beneficiaire-detail", "beneficiaire-form", "partage-fonds", "virement-choix", "virement-instantane", "virement-classique", "transfert-cartes", "confirmation", "recharger"])
  if (process.env.NODE_ENV !== "production" && requestPath === "/" && previewView && previewViews.has(previewView)) {
    const html = readFileSync(target, "utf8")
      .replace('<div id="loader-screen"', '<div id="loader-screen" class="fade-out"')
      .replace('class="view active" id="view-login"', 'class="view" id="view-login"')
      .replace(`class="view" id="view-${previewView}"`, `class="view active" id="view-${previewView}"`)

    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    })
    res.end(html)
    return
  }

  res.writeHead(200, {
    "cache-control": "no-store",
    "content-type": mimeTypes[extname(target)] ?? "application/octet-stream",
  })
  createReadStream(target).pipe(res)
}).listen(port, () => {
  console.log(`VTEX Wallet development server ready on port ${port}`)
})
