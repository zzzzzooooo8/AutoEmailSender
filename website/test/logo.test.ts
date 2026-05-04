import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const expectSharpMailLogo = (svg: string) => {
  expect(svg).toContain('viewBox="0 0 16 16"');
  expect(svg).toContain('fill="#991b1b"');
  expect(svg).toContain('rx="3"');
  expect(svg).toContain('shape-rendering="crispEdges"');
  expect(svg).toContain('stroke="#ffffff"');
  expect(svg).toContain('stroke-width="1"');
  expect(svg).toContain('d="M12.5 5.5 8.9 8.1a1.5 1.5 0 0 1-1.8 0L3.5 5.5"');
  expect(svg).toContain('x="3.5" y="4.5" width="9" height="7" rx="1"');
};

describe("website logo assets", () => {
  it("uses the primary rounded mail logo for the nav logo", () => {
    expectSharpMailLogo(readFileSync(resolve("public/logo.svg"), "utf8"));
  });

  it("uses the primary rounded mail logo for the favicon", () => {
    expectSharpMailLogo(readFileSync(resolve("public/favicon.svg"), "utf8"));
  });
});
