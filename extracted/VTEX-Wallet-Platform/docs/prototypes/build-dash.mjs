// Assemble le prototype Dashboard en un seul fragment publiable (art/out/dashboard.html).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => readFileSync(join(here, f), "utf8").replace(/^﻿/, "")
const script = (code) => `<script>\n${code.replace(/<\/script/gi, "<\\/script")}\n</script>`
const fontImport = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');"

const out = `<title>VTEX Dashboard</title>
<style>
${fontImport}
${read("dash.css")}
</style>
<div id="app"></div>
<div class="overlay" id="overlay"></div>
<aside class="drawer" id="drawer" aria-label="Détail"></aside>
<div class="dlg" id="dlg" role="dialog" aria-modal="true"></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
${script(read("core.js"))}
${script(read("dash-data.js"))}
${script(read("dash.js"))}
`
mkdirSync(join(here, "out"), { recursive: true })
writeFileSync(join(here, "out", "dashboard.html"), out)
console.log("dashboard.html", (out.length / 1024).toFixed(0) + " Ko")
