// Assemble l'application Wallet réelle (apps/wallet) en UN fichier publiable : CSS/JS inlinés, serveur de démonstration en mémoire.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const app = process.env.WALLET_DIR
const read = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "")
const script = (code) => `<script>\n${code.replace(/<\/script/gi, "<\\/script")}\n</script>`
const style = (css, attrs = "") => `<style${attrs}>\n${css}\n</style>`

let html = read(join(app, "index.html"))

// 1) head : on ne garde que ce que l'artefact peut charger (Google Fonts via @import, cdnjs/jsdelivr pour les scripts)
const head = html.slice(html.indexOf("<head>") + 6, html.indexOf("</head>"))
const body = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"))

let headOut = head
  .replace(/<title>[\s\S]*?<\/title>/, "")
  .replace(/<meta charset[^>]*>/i, "")
  .replace(/<meta name="viewport"[^>]*>/i, "")
  .replace(/<meta name="theme-color"[^>]*>/i, "")
  .replace(/<link rel="manifest"[^>]*>/i, "")
  .replace(/<link rel="icon"[^>]*>/i, "")
  .replace(/<link rel="apple-touch-icon"[^>]*>/i, "")
  .replace(/<script src="https:\/\/unpkg.com\/@phosphor-icons[^>]*><\/script>/i, "")
  .replace(/<script src="https:\/\/unpkg.com\/lucide@latest"><\/script>/i, '<script src="https://cdn.jsdelivr.net/npm/lucide@0.263.1/dist/umd/lucide.min.js"></script>')
  .replace(/<link rel="stylesheet" href="https:\/\/cdn.jsdelivr.net\/npm\/remixicon[^>]*>/i, "")
  .replace(/<link id="aurora-home-style"[^>]*>/i, style(read(join(app, "aurora-home.css")), ' id="aurora-home-style" disabled'))
  .replace(/<link rel="stylesheet" href="\/aurora-home-bridge.css">/i, style(read(join(app, "aurora-home-bridge.css"))))
  .replace(/<link rel="stylesheet" href="\/topup.css">/i, style(read(join(app, "topup.css"))))

// 2) body : les <script src> locaux deviennent des scripts inline ; le routeur d'URL est retiré (pushState n'a pas de sens dans l'iframe de l'artefact)
const core = read(join(here, "core.js"))
const backend = read(join(here, "wallet-backend.js"))
let vtexApi = read(join(app, "vtex-api.js"))
  .replace("Développement — aucun e-mail envoyé, code : ", "Démo — code de vérification : ")

let bodyOut = body
  .replace(/<script src="three.min.js"><\/script>/, () => script(read(join(app, "three.min.js"))))
  .replace(/<script src="vtex3d.js"><\/script>/, () => script(read(join(app, "vtex3d.js"))))
  .replace(/<script src="vtex-api.js[^"]*"><\/script>/, () => script(core) + "\n" + script(backend) + "\n" + script(vtexApi))
  .replace(/<script src="topup.js"><\/script>/, () => script(read(join(app, "topup.js"))))
  .replace(/<script src="router.js"><\/script>/, "")
  // l'aperçu local (hôte localhost) court-circuite la connexion : dans l'artefact on veut le vrai parcours connexion → OTP → hydratation
  .replace(/return host === "localhost"[^;]*;/, "return false;")
if (!bodyOut.includes("return false;")) throw new Error("isDemoPreview non patché")

// 3) préremplissage de la connexion de démonstration
const demoInit = script(`
(function(){
  function fill(){
    var e=document.getElementById('auth-email'), p=document.getElementById('auth-password');
    if(e&&!e.value) e.value='ariel.kouadio@vtex.app';
    if(p&&!p.value) p.value='prototype-demo';
  }
  fill(); document.addEventListener('DOMContentLoaded', fill);
})();`)

const out = `<title>VTEX Wallet</title>\n${headOut}\n${bodyOut}\n${demoInit}\n`
const outDir = join(here, "out")
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, "wallet.html"), out)
console.log("wallet.html", (out.length / 1024).toFixed(0) + " Ko", "external refs:", [...out.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).join(" | "))
