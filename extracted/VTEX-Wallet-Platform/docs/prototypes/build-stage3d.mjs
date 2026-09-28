// Extrait le moteur 3D de apps/business/src/components/dashboard/CardStage3D.tsx (Three.js r160) et le transpile en JavaScript autonome
// pour le prototype Wallet Pro : mêmes cartes gravées, même ressort physique, même geste — sans React.
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const business = process.env.BUSINESS_DIR
if (!business) throw new Error("Définir BUSINESS_DIR (apps/business).")
const require = createRequire(join(business, "package.json"))
const ts = require("typescript")
const src = readFileSync(join(business, "src/components/dashboard/CardStage3D.tsx"), "utf8")

const pureStart = src.indexOf("type CardTheme")
const compStart = src.indexOf("/** Le carrousel se reconstruit")
const effStart = src.indexOf("useEffect(() => {") + "useEffect(() => {".length
const effEnd = src.indexOf("    // `display` est figé au montage")
if ([pureStart, compStart, effStart, effEnd].some((i) => i < 0) || compStart < pureStart || effEnd < effStart) throw new Error("repères introuvables dans CardStage3D.tsx")

let pure = src.slice(pureStart, compStart)
let eff = src.slice(effStart, effEnd)

const swap = (text, from, to) => { if (!text.includes(from)) throw new Error("introuvable : " + from); return text.split(from).join(to) }

// cartes : fournies par l'appelant (comptes réels du prototype) au lieu du jeu d'exemple
const cardsDecl = pure.indexOf("const CARDS: BizCard[] = [")
const cardsEnd = pure.indexOf("]\n", cardsDecl) + 2
pure = pure.slice(0, cardsDecl) + "let CARDS: BizCard[] = []\n" + pure.slice(cardsEnd)
// formatage du solde : moteur VtexCore du prototype (un seul jeu de règles pour tout le prototype)
pure = pure.replace(/function balanceStr\([^)]*\) \{[\s\S]*?\n\}/, "function balanceStr(v: number, display: string) {\n  return (window as any).VtexCore.fmt((window as any).VtexCore.convert(Math.round(v * 100), \"EUR\", display), display)\n}")

eff = swap(eff, "const canvas = canvasRef.current, hit = hitRef.current", 'const canvas = root.querySelector<HTMLCanvasElement>("canvas.vs-canvas"), hit = root.querySelector<HTMLElement>(".vs-hit")')
for (const [ref, name] of [["subRef", "elSub"], ["amtRef", "elAmt"], ["countRef", "elCount"], ["dotsRef", "elDots"], ["prevBtnRef", "elPrev"], ["nextBtnRef", "elNext"]]) eff = swap(eff, ref + ".current", name)
eff = swap(eff, "apiRef.current = ", "api = ")
eff = swap(eff, "const subEl = elSub, amtEl = elAmt", "const subEl = elSub, amtEl = elAmt")

const wrapper = `declare const THREE: any
${pure}
function mountStage(root: HTMLElement, display: string, cardsInput: BizCard[]) {
  CARDS = cardsInput
  const elSub = root.querySelector<HTMLElement>(".vs-sub"), elAmt = root.querySelector<HTMLElement>(".vs-amt"), elCount = root.querySelector<HTMLElement>(".vs-count"), elDots = root.querySelector<HTMLElement>(".vs-dots")
  const elPrev = root.querySelector<HTMLButtonElement>(".vs-prev"), elNext = root.querySelector<HTMLButtonElement>(".vs-next")
  let api: { previous: () => void; next: () => void } | null = null
  const cleanup = (() => {${eff}})()
  if (elPrev) elPrev.onclick = () => api && api.previous()
  if (elNext) elNext.onclick = () => api && api.next()
  return cleanup
}
`
const out = ts.transpileModule(wrapper, { compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.None, removeComments: false } }).outputText
const header = "/* Moteur 3D des cartes Wallet Pro — extrait de apps/business/src/components/dashboard/CardStage3D.tsx (Three.js r160), transpilé sans React. */\n"
writeFileSync(join(here, "stage3d.js"), header + out + "\nwindow.VtexStage3D = { mount: mountStage };\n")
console.log("stage3d.js", (out.length / 1024).toFixed(0) + " Ko")
