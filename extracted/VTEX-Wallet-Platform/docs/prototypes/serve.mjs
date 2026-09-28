// Sert les fragments d'artefact (art/out/*.html) enveloppés comme le fait la publication, pour les tester localement.
import { createServer } from "node:http"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const skeleton = (content) => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n${content}\n</body></html>`

createServer((req, res) => {
  const name = (req.url ?? "/").split("?")[0].replace(/^\//, "") || "wallet"
  const file = join(here, "out", name.replace(/\.html$/, "") + ".html")
  if (!existsSync(file)) { res.writeHead(404); res.end("not found: " + name); return }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
  res.end(skeleton(readFileSync(file, "utf8")))
}).listen(Number(process.env.PORT ?? 3010), () => console.log("artifact preview on", process.env.PORT ?? 3010))
