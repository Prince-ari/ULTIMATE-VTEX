import { describe, expect, it } from "vitest"
import { avatarUrlPatchSchema, avatarUrlSchema } from "./avatarUrl"

describe("avatarUrlSchema", () => {
  it("accepte une URL HTTPS et autorise le retrait explicite", () => {
    expect(avatarUrlSchema.parse("https://images.example.com/avatar.jpg")).toBe("https://images.example.com/avatar.jpg")
    expect(avatarUrlPatchSchema.parse(null)).toBeNull()
  })

  it("refuse les schémas non sécurisés et les valeurs non URL", () => {
    expect(() => avatarUrlSchema.parse("http://images.example.com/avatar.jpg")).toThrow()
    expect(() => avatarUrlSchema.parse("photo.jpg")).toThrow()
  })
})
