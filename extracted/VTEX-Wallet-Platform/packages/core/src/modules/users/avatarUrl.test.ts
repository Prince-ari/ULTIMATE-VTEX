import { describe, expect, it } from "vitest"
import { avatarUrlPatchSchema, avatarUrlSchema } from "./avatarUrl"

describe("avatarUrlSchema", () => {
  it("accepte le chemin média interne d’un import réel et autorise le retrait explicite", () => {
    expect(avatarUrlSchema.parse("/api/media/object/media/users/42/avatar/photo.jpg")).toBe("/api/media/object/media/users/42/avatar/photo.jpg")
    expect(avatarUrlPatchSchema.parse(null)).toBeNull()
  })

  it("refuse toute URL externe, HTTPS ou non — l’import par URL est retiré", () => {
    expect(() => avatarUrlSchema.parse("https://images.example.com/avatar.jpg")).toThrow()
    expect(() => avatarUrlSchema.parse("http://images.example.com/avatar.jpg")).toThrow()
    expect(() => avatarUrlSchema.parse("photo.jpg")).toThrow()
  })
})
