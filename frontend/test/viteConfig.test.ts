import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("vite dev server config", () => {
  it("binds to the same IPv4 host used by the Electron dev shell", () => {
    const source = readFileSync(resolve("vite.config.ts"), "utf8");

    expect(source).toContain('host: "127.0.0.1"');
  });

  it("splits node-only and jsdom tests into separate Vitest projects", () => {
    const source = readFileSync(resolve("vite.config.ts"), "utf8");

    expect(source).toContain("projects:");
    expect(source).toContain('name: "node"');
    expect(source).toContain('environment: "node"');
    expect(source).toContain('name: "jsdom"');
    expect(source).toContain('environment: "jsdom"');
  });
});
