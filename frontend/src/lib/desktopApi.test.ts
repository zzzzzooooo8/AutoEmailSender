import { beforeEach, describe, expect, it } from "vitest";
import { getDesktopAppVersion, isDesktopApp } from "@/lib/desktopApi";

describe("desktopApi", () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, "autoEmailSender");
  });

  it("detects browser mode", () => {
    expect(isDesktopApp()).toBe(false);
  });

  it("reads desktop app version", async () => {
    window.autoEmailSender = {
      backendBaseUrl: "http://127.0.0.1:48123",
      getVersion: async () => "0.1.0",
      checkForUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
      downloadUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
      quitAndInstall: async () => undefined,
      onUpdateStatus: () => () => undefined,
    };

    expect(isDesktopApp()).toBe(true);
    await expect(getDesktopAppVersion()).resolves.toBe("0.1.0");
  });
});
