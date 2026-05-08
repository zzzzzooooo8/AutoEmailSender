import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildBackendEnv,
  getBackendExecutablePath,
  getFrontendIndexPath,
  notifyBackendExit,
  normalizePort,
  stopBackend,
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
      isPackaged: true,
      repoRoot: "C:\\Repo",
      resourcesPath: "C:\\App\\resources",
      userDataPath: "C:\\Users\\Alice\\AppData\\Roaming\\Auto Email Sender",
    });

    expect(env.PATH).toBe("C:\\Windows");
    expect(env.AUTO_EMAIL_SENDER_DATA_DIR).toBe(
      "C:\\Users\\Alice\\AppData\\Roaming\\Auto Email Sender",
    );
    expect(env.ENABLE_BACKGROUND_WORKERS).toBe("true");
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe("C:\\App\\resources\\ms-playwright");
  });

  it("uses repo browser cache for dev backend environment", () => {
    const env = buildBackendEnv({
      baseEnv: {},
      isPackaged: false,
      resourcesPath: "C:\\App\\resources",
      repoRoot: "C:\\Repo",
      userDataPath: "C:\\Users\\Alice\\AppData\\Roaming\\Auto Email Sender",
    });

    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe("C:\\Repo\\backend\\ms-playwright");
  });

  it("allows backend controllers to expose readiness separately from process launch", async () => {
    let markReady: (() => void) | undefined;
    const controller = {
      baseUrl: "http://127.0.0.1:48123",
      ready: new Promise<void>((resolve) => {
        markReady = resolve;
      }),
      stop: async () => undefined,
    };
    let ready = false;
    void controller.ready.then(() => {
      ready = true;
    });

    await Promise.resolve();
    expect(controller.baseUrl).toBe("http://127.0.0.1:48123");
    expect(ready).toBe(false);

    markReady?.();
    await controller.ready;
    expect(ready).toBe(true);
  });

  it("normalizes valid ports", () => {
    expect(normalizePort("48123")).toBe(48123);
  });

  it("notifies when backend exits unexpectedly", () => {
    const exits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = [];

    notifyBackendExit(
      {
        intentionalStop: false,
        onUnexpectedExit: (exit) => exits.push(exit),
      },
      1,
      null,
    );

    expect(exits).toEqual([{ code: 1, signal: null }]);
  });

  it("does not notify when backend exits during intentional stop", () => {
    const exits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = [];

    notifyBackendExit(
      {
        intentionalStop: true,
        onUnexpectedExit: (exit) => exits.push(exit),
      },
      0,
      null,
    );

    expect(exits).toEqual([]);
  });

  it("terminates the backend process tree during stop", async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      exitCode: null as number | null,
      kill: () => {
        throw new Error("direct child kill should not be used when a pid is available");
      },
    }) as unknown as ChildProcessWithoutNullStreams;
    const terminatedPids: number[] = [];

    await stopBackend(
      child,
      { intentionalStop: false },
      async (pid) => {
        terminatedPids.push(pid);
        Object.assign(child, { exitCode: 0 });
        child.emit("exit", 0, null);
      },
    );

    expect(terminatedPids).toEqual([1234]);
  });
});
