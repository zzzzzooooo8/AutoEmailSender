import { describe, expect, it } from "vitest";
import { formatDownloadProgress } from "../src/updates.js";

describe("update helpers", () => {
  it("rounds download progress to one decimal place", () => {
    expect(formatDownloadProgress(47.236)).toBe(47.2);
  });
});
