import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop packaging compatibility", () => {
  it("builds frontend assets with relative paths for file URLs", () => {
    const source = readFileSync(path.resolve("vite.config.ts"), "utf8");

    expect(source).toContain('base: "./"');
  });

  it("uses hash routing in the desktop shell", () => {
    const source = readFileSync(path.resolve("src", "App.tsx"), "utf8");

    expect(source).toContain("HashRouter");
    expect(source).toContain("window.autoEmailSender");
  });
});
