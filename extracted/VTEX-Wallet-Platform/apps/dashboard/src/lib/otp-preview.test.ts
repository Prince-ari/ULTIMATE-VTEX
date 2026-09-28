import { describe, expect, it } from "vitest"

import { canRevealDevelopmentOtp } from "./otp-preview"

describe("canRevealDevelopmentOtp", () => {
  it("refuses development OTP exposure in production", () => {
    expect(canRevealDevelopmentOtp("production")).toBe(false)
  })

  it("allows the local development aid outside production", () => {
    expect(canRevealDevelopmentOtp("development")).toBe(true)
    expect(canRevealDevelopmentOtp("test")).toBe(true)
  })
})
