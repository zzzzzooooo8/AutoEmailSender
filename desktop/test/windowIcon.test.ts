import { describe, expect, it } from "vitest";
import { getWindowIconPath } from "../src/windowIcon.js";

describe("desktop window icon", () => {
  it("uses the packaged app icon", () => {
    expect(
      getWindowIconPath({
        isPackaged: true,
        resourcesPath: "C:\\App\\resources",
        repoRoot: "C:\\Repo",
      }),
    ).toBe("C:\\App\\resources\\build\\icon.ico");
  });

  it("uses the repo app icon in dev", () => {
    expect(
      getWindowIconPath({
        isPackaged: false,
        resourcesPath: "C:\\App\\resources",
        repoRoot: "C:\\Repo",
      }),
    ).toBe("C:\\Repo\\desktop\\build\\icon.ico");
  });
});
