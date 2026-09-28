import { spawn } from "node:child_process"

const runner = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
let stopping = false

function start(args, stdio = "inherit", env = process.env) {
  return spawn(runner, args, {
    cwd: process.cwd(),
    stdio,
    env,
    detached: process.platform !== "win32",
  })
}

// Le Dashboard est démarré en premier pour conserver le port de prévisualisation
// 3000. L’API reste sur 4000 et est consommée uniquement par les rewrites du
// Dashboard ; aucun secret ni port métier n’est exposé côté navigateur.
const dashboard = start(["--filter", "@vtex/dashboard", "exec", "next", "dev", "-p", "3000"])
const apiEnv = { ...process.env }
if (apiEnv.NODE_ENV !== "production" && (!apiEnv.JWT_SECRET || apiEnv.JWT_SECRET.length < 32 || apiEnv.JWT_SECRET === "insecure-dev-secret")) {
  apiEnv.JWT_SECRET = "vtex-local-development-secret-at-least-32-characters"
}
const api = start(["--filter", "@vtex/api", "dev"], "ignore", apiEnv)

function stopChild(child) {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === "win32") {
    child.kill("SIGTERM")
    return
  }
  process.kill(-child.pid, "SIGTERM")
}

function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  stopChild(dashboard)
  stopChild(api)
  process.exit(exitCode)
}

process.once("SIGINT", () => stop())
process.once("SIGTERM", () => stop())

dashboard.once("exit", (code) => stop(code ?? 0))
api.once("exit", (code) => {
  if (!stopping && code && code !== 0) {
    console.error(`L’API de développement s’est arrêtée (code ${code ?? "inconnu"}).`)
    stop(code ?? 1)
  }
})
