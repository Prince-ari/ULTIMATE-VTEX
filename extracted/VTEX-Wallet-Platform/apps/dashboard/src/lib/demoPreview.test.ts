import { describe, expect, it } from "vitest"

import { isDemoPreview } from "./demoPreview"

describe("isDemoPreview", () => {
  it("autorise exclusivement les hôtes locaux et de prévisualisation lorsqu’il est explicitement demandé", () => {
    expect(isDemoPreview("localhost", "development", true)).toBe(true)
    expect(isDemoPreview("3000-example.manus.computer", "development", true)).toBe(true)
    expect(isDemoPreview("wallet.example.com", "development", true)).toBe(false)
    expect(isDemoPreview("localhost", "development", false)).toBe(false)
  })

  it("désactive toujours l’aperçu en production", () => {
    expect(isDemoPreview("localhost", "production", true)).toBe(false)
    expect(isDemoPreview("3000-example.manus.computer", "production", true)).toBe(false)
  })
})
