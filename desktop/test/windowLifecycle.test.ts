import { describe, expect, it } from "vitest";
import { restoreExistingWindow, shouldHideWindowOnClose } from "../src/windowLifecycle.js";

describe("desktop window lifecycle", () => {
  it("hides the window instead of quitting on normal close", () => {
    expect(shouldHideWindowOnClose({ isQuitting: false })).toBe(true);
  });

  it("allows the app to quit after an explicit exit action", () => {
    expect(shouldHideWindowOnClose({ isQuitting: true })).toBe(false);
  });

  it("restores, shows, and focuses an existing window", () => {
    const calls: string[] = [];
    const window = {
      isMinimized: () => true,
      restore: () => calls.push("restore"),
      show: () => calls.push("show"),
      focus: () => calls.push("focus"),
    };

    restoreExistingWindow(window);

    expect(calls).toEqual(["restore", "show", "focus"]);
  });

  it("does not restore a window that is not minimized", () => {
    const calls: string[] = [];
    const window = {
      isMinimized: () => false,
      restore: () => calls.push("restore"),
      show: () => calls.push("show"),
      focus: () => calls.push("focus"),
    };

    restoreExistingWindow(window);

    expect(calls).toEqual(["show", "focus"]);
  });
});
