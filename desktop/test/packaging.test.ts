import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("windows installer packaging", () => {
  it("builds preload as CommonJS for Electron sandbox preload", () => {
    const packageJson = readFileSync(path.resolve("package.json"), "utf8");

    expect(packageJson).toContain("tsconfig.preload.json");
  });

  it("uses the project icon for Windows builds", () => {
    const config = readFileSync(path.resolve("electron-builder.yml"), "utf8");

    expect(config).toContain("icon: build/icon.ico");
    expect(config).toContain("installerIcon: build/icon.ico");
    expect(config).toContain("uninstallerIcon: build/icon.ico");
    expect(existsSync(path.resolve("build", "icon.ico"))).toBe(true);
  });

  it("uses an assisted installer with selectable install directory", () => {
    const config = readFileSync(path.resolve("electron-builder.yml"), "utf8");

    expect(config).toContain("oneClick: false");
    expect(config).toContain("allowToChangeInstallationDirectory: true");
    expect(config).toContain("createDesktopShortcut: true");
  });
});
