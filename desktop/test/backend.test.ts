import { describe, expect, it } from "vitest";
import {
  buildBackendEnv,
  getBackendExecutablePath,
  getFrontendIndexPath,
  normalizePort,
} from "../src/backend.js";

describe("desktop backend helpers", () => {
  it("resolves packaged backend executable path", () => {
    expect(
      getBackendExecutablePath({
        isPackaged: true,
        resourcesPath: "C:\\App\\resources",
        repoRoot: "C:\\Repo",
      }),
    ).toBe("C:\\App\\resources\\backend\\backend.exe");
  });

  it("resolves dev backend entry path", () => {
    expect(
      getBackendExecutablePath({
        isPackaged: false,
        resourcesPath: "C:\\App\\resources",
        repoRoot: "C:\\Repo",
      }),
    ).toBe("C:\\Repo\\backend\\desktop_entry.py");
  });

  it("resolves packaged frontend index path", () => {
    expect(
      getFrontendIndexPath({
        isPackaged: true,
        resourcesPath: "C:\\App\\resources",
        repoRoot: "C:\\Repo",
      }),
    ).toBe("C:\\App\\resources\\frontend\\index.html");
  });

  it("builds backend environment with desktop data dir", () => {
    const env = buildBackendEnv({
      baseEnv: { PATH: "C:\\Windows" },
      userDataPath: "C:\\Users\\Alice\\AppData\\Roaming\\Auto Email Sender",
    });

    expect(env.PATH).toBe("C:\\Windows");
    expect(env.AUTO_EMAIL_SENDER_DATA_DIR).toBe(
      "C:\\Users\\Alice\\AppData\\Roaming\\Auto Email Sender",
    );
    expect(env.ENABLE_BACKGROUND_WORKERS).toBe("true");
  });

  it("normalizes valid ports", () => {
    expect(normalizePort("48123")).toBe(48123);
  });
});
