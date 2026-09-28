// Assemble le prototype Wallet Pro en un seul fragment publiable (art/out/pro.html).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => readFileSync(join(here, f), "utf8").replace(/^\uFEFF/, "")
const script = (code) => `<script>\n${code.replace(/<\/script/gi, "<\\/script")}\n</script>`

const fontImport = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');"
const out = `<title>VTEX Wallet Pro</title>
<style>
${fontImport}
${read("receipt.css")}
${read("pro.css").replace(fontImport, "")}
</style>
<div id="app"></div>
<div id="screen-topup" aria-label="Recharger le wallet Pro"></div>
<div class="overlay" id="overlay"></div>
<aside class="drawer" id="drawer" aria-label="Détail"></aside>
<div class="dlg" id="dlg" role="dialog" aria-modal="true"></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
${script(read("core.js"))}
${script(read("receipt.js"))}
${script(read("three.min.js"))}
${script(read("stage3d.js"))}
${script(read("pro-data.js"))}
${script(read("pro.js"))}
`
mkdirSync(join(here, "out"), { recursive: true })
writeFileSync(join(here, "out", "pro.html"), out)
console.log("pro.html", (out.length / 1024).toFixed(0) + " Ko")
