import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const walletHtml = fileURLToPath(new URL("./index.html", import.meta.url));

describe("Wallet entry video background", () => {
  it("uses project-hosted media with a static fallback and reduced-motion safeguard", async () => {
    const source = await readFile(walletHtml, "utf8");

    expect(source).toContain('/manus-storage/vtex-wallet-entry-background_f760ad0d.mp4');
    expect(source).toContain('/manus-storage/vtex-wallet-entry-background_d796cd45.jpg');
    expect(source).toContain('data-entry-stage="loader"');
    expect(source).toContain('data-entry-stage="login"');
    expect(source).toContain('data-entry-stage="otp"');
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("function syncEntryVideos(activeStage)");
    expect(source).not.toContain("videos.pexels.com/video-files");
  });
});
