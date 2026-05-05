import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  buildApiPath,
  buildApiUrl,
  updateDesktopBackendBaseUrl,
} from "@/lib/api/client";

describe("api client desktop base url", () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, "autoEmailSender");
    updateDesktopBackendBaseUrl(null);
    vi.unstubAllGlobals();
  });

  it("uses relative paths in browser mode", () => {
    expect(buildApiPath("/api/ping")).toBe("/api/ping");
    expect(buildApiUrl("/api/ping")).toBe("http://localhost:3000/api/ping");
  });

  it("uses desktop backend base url when preload provides it", () => {
    window.autoEmailSender = {
      backendBaseUrl: "http://127.0.0.1:48123",
      getVersion: async () => "0.1.0",
      checkForUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
      downloadUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
      switchToFullDownload: async () => ({ state: "not_available", version: "0.1.0" }),
      quitAndInstall: async () => undefined,
      onUpdateStatus: () => () => undefined,
    };

    expect(buildApiPath("/api/ping")).toBe("http://127.0.0.1:48123/api/ping");
    expect(buildApiUrl("/api/ping")).toBe("http://127.0.0.1:48123/api/ping");
  });

  it("uses runtime desktop backend base url updates", () => {
    window.autoEmailSender = {
      backendBaseUrl: "http://127.0.0.1:48123",
      getVersion: async () => "0.1.0",
      checkForUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
      downloadUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
      switchToFullDownload: async () => ({ state: "not_available", version: "0.1.0" }),
      quitAndInstall: async () => undefined,
      onUpdateStatus: () => () => undefined,
    };

    updateDesktopBackendBaseUrl("http://127.0.0.1:48124");

    expect(buildApiPath("/api/ping")).toBe("http://127.0.0.1:48124/api/ping");
    expect(buildApiUrl("/api/ping")).toBe("http://127.0.0.1:48124/api/ping");
  });

  it("waits for a desktop backend ready event before fetching without an initial base url", async () => {
    let backendStatusCallback:
      | ((status: { state: "ready"; baseUrl: string }) => void)
      | undefined;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "ok" })));
    vi.stubGlobal("fetch", fetchMock);
    window.autoEmailSender = {
      getVersion: async () => "0.1.0",
      checkForUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
      downloadUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
      switchToFullDownload: async () => ({ state: "not_available", version: "0.1.0" }),
      quitAndInstall: async () => undefined,
      onBackendStatus: (callback) => {
        backendStatusCallback = callback as typeof backendStatusCallback;
        return () => undefined;
      },
      onUpdateStatus: () => () => undefined,
    };

    const request = apiFetch<{ status: string }>("/health");
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();

    backendStatusCallback?.({ state: "ready", baseUrl: "http://127.0.0.1:48124" });

    await expect(request).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:48124/health",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );
  });
});
