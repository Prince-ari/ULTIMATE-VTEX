import { describe, expect, it } from "vitest"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

describe("Dashboard — relais API même origine", () => {
  it("relaye tRPC, l’OTP, les médias et les événements vers le service API", async () => {
    const config = await readFile(resolve(process.cwd(), "next.config.mjs"), "utf8")

    expect(config).toContain('source: "/api/trpc/:path*"')
    expect(config).toContain('source: "/api/auth/:path*"')
    expect(config).toContain('source: "/api/media/:path*"')
    expect(config).toContain('source: "/api/events"')
  })
})
