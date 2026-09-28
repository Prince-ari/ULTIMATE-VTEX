import { describe, expect, it } from "vitest";

describe("Resend credentials", () => {
  it("authenticates against the lightweight domains endpoint without exposing the key", async () => {
    const apiKey = process.env.RESEND_API_KEY;

    expect(apiKey, "RESEND_API_KEY must be configured for production email delivery").toMatch(/^re_/);

    const response = await fetch("https://api.resend.com/domains", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.status, `Resend credentials were rejected with HTTP ${response.status}`).toBe(200);
    const payload = (await response.json()) as { data?: unknown };
    expect(Array.isArray(payload.data)).toBe(true);
  }, 15_000);
});
