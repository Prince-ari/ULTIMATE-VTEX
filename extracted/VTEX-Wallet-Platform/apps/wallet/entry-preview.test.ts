import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiClient = fileURLToPath(new URL("./vtex-api.js", import.meta.url));

describe("Wallet entry preview", () => {
  it("keeps login and OTP available as local preview targets", async () => {
    const source = await readFile(apiClient, "utf8");

    expect(source).toContain('"login", "otp", "accueil"');
  });
});
