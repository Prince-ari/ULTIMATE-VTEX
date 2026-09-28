import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const deploymentDirectory = fileURLToPath(new URL(".", import.meta.url))
const projectDirectory = join(deploymentDirectory, "..")
const readProjectFile = (path) => readFileSync(join(projectDirectory, path), "utf8")

test("la topologie de production relie le Wallet à l’API interne", () => {
  const compose = readProjectFile("deployment/docker-compose.hostinger.yml")
  const wallet = compose.slice(compose.indexOf("  wallet:"), compose.indexOf("  nginx:"))

  assert.match(wallet, /API_PROXY_URL:\s*http:\/\/api:4000/)
  assert.match(compose, /NEXT_PUBLIC_API_URL:\s*http:\/\/api:4000/)
})

test("le script affiche toujours le domaine Dashboard configuré", () => {
  const script = readProjectFile("deployment/deploy-hostinger.sh")

  assert.match(script, /DASHBOARD_PUBLIC_URL:-https:\/\/\$\{DASHBOARD_HOST\}/)
  assert.doesNotMatch(script, /admin\.example\.com/)
})

test("la documentation active n’oriente plus vers le proxy Nginx monodomaine retiré", () => {
  const readme = readProjectFile("README.md")

  assert.match(readme, /nginx\.vtex\.conf\.template/)
  assert.doesNotMatch(readme, /nginx\.hostinger\.conf\.example/)
})
