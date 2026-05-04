import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("vite dev server config", () => {
  it("binds to the same IPv4 host used by the Electron dev shell", () => {
    const source = readFileSync(resolve("vite.config.ts"), "utf8");

    expect(source).toContain('host: "127.0.0.1"');
  });
});
