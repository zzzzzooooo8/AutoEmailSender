import { describe, expect, it } from "vitest";
import { shouldHideWindowOnClose } from "../src/windowLifecycle.js";

describe("desktop window lifecycle", () => {
  it("hides the window instead of quitting on normal close", () => {
    expect(shouldHideWindowOnClose({ isQuitting: false })).toBe(true);
  });

  it("allows the app to quit after an explicit exit action", () => {
    expect(shouldHideWindowOnClose({ isQuitting: true })).toBe(false);
  });
});
