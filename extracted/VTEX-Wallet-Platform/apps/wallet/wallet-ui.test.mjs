import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const readLocal = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8")
const html = readLocal("index.html")
const api = readLocal("vtex-api.js")

test("les contrôles Wallet sensibles restent sémantiques et décrits", () => {
  assert.match(html, /<button type="button" class="auth-faceid"[^>]*aria-describedby="auth-biometric-help"/)
  assert.match(html, /<button type="button" class="wtg-eye"[^>]*aria-pressed="false"[^>]*aria-label="Masquer le solde"/)
  assert.match(html, /id="otp-error" class="auth-inline-alert" role="alert" hidden/)
  assert.match(html, /id="otp-dots" role="img" aria-label="Code à six chiffres, aucune saisie effectuée"/)
  assert.match(html, /wrap\.setAttribute\("aria-pressed", String\(finBalHidden\)\)/)
  assert.match(html, /wrap\.setAttribute\("aria-label", finBalHidden \? "Afficher le solde" : "Masquer le solde"\)/)
})

test("le Wallet expose un état global de chargement et de reprise", () => {
  assert.match(html, /id="wallet-service-state" data-kind="idle" role="status" aria-live="polite" hidden/)
  assert.match(html, /id="wallet-service-state-retry"[^>]*hidden>Réessayer<\/button>/)
  assert.match(api, /function setWalletServiceState\(kind, title, detail, retryable\)/)
  assert.match(api, /Mise à jour du Wallet indisponible/)
  assert.match(api, /window\.retryWalletConnection = function \(\)/)
})

test("le shell Wallet desktop conserve une largeur calculée depuis le viewport", () => {
  assert.match(html, /width:calc\(100vw - clamp\(36px,5\.2vw,84px\)\)!important;max-width:1540px!important/)
})
