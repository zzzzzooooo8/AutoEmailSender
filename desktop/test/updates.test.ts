import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatDownloadProgress } from "../src/updates.js";

describe("update helpers", () => {
  it("rounds download progress to one decimal place", () => {
    expect(formatDownloadProgress(47.236)).toBe(47.2);
  });

  it("loads electron-updater through CommonJS interop for packaged ESM runtime", () => {
    const source = readFileSync(path.resolve("src", "updates.ts"), "utf8");

    expect(source).toContain("createRequire");
    expect(source).not.toContain('import { autoUpdater } from "electron-updater"');
  });
});
