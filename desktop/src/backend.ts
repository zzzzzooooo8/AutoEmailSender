import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import type {
  BackendController,
  BackendEnvInput,
  BackendExit,
  BackendExitHandler,
  BackendPathInput,
} from "./types.js";

export function normalizePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

export function getBackendExecutablePath(input: BackendPathInput): string {
  if (input.isPackaged) {
    return path.join(input.resourcesPath, "backend", "backend.exe");
  }
  return path.join(input.repoRoot, "backend", "desktop_entry.py");
}

export function getFrontendIndexPath(input: BackendPathInput): string {
  if (input.isPackaged) {
    return path.join(input.resourcesPath, "frontend", "index.html");
  }
  return path.join(input.repoRoot, "frontend", "dist", "index.html");
}

export function buildBackendEnv(input: BackendEnvInput): NodeJS.ProcessEnv {
  return {
    ...input.baseEnv,
    AUTO_EMAIL_SENDER_DATA_DIR: input.userDataPath,
    ENABLE_BACKGROUND_WORKERS: "true",
  };
}

export async function findAvailablePort(startPort = 48120): Promise<number> {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error("No available backend port found.");
}

export async function startBackend(options: {
  isPackaged: boolean;
  resourcesPath: string;
  repoRoot: string;
  userDataPath: string;
  onUnexpectedExit?: BackendExitHandler;
}): Promise<BackendController> {
  const port = await findAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const backendPath = getBackendExecutablePath(options);

  if (!existsSync(backendPath)) {
    throw new Error(`Backend executable not found: ${backendPath}`);
  }

  const child = spawnBackend({
    backendPath,
    isPackaged: options.isPackaged,
    port,
    env: buildBackendEnv({
      baseEnv: process.env,
      userDataPath: options.userDataPath,
    }),
    repoRoot: options.repoRoot,
  });
  const lifecycle: BackendLifecycle = {
    intentionalStop: false,
    onUnexpectedExit: options.onUnexpectedExit,
  };
  child.once("exit", (code, signal) => {
    notifyBackendExit(lifecycle, code, signal);
  });

  return {
    baseUrl,
    ready: waitForReady(baseUrl, child),
    stop: () => stopBackend(child, lifecycle),
  };
}

type BackendLifecycle = {
  intentionalStop: boolean;
  onUnexpectedExit?: BackendExitHandler;
};

export function notifyBackendExit(
  lifecycle: BackendLifecycle,
  code: number | null,
  signal: NodeJS.Signals | null,
): void {
  if (lifecycle.intentionalStop) {
    return;
  }
  lifecycle.onUnexpectedExit?.({ code, signal } satisfies BackendExit);
}

function spawnBackend(input: {
  backendPath: string;
  isPackaged: boolean;
  port: number;
  env: NodeJS.ProcessEnv;
  repoRoot: string;
}): ChildProcessWithoutNullStreams {
  if (input.isPackaged) {
    return spawn(input.backendPath, ["--host", "127.0.0.1", "--port", String(input.port)], {
      env: input.env,
      windowsHide: true,
    });
  }

  return spawn(
    "uv",
    ["run", "python", "desktop_entry.py", "--host", "127.0.0.1", "--port", String(input.port)],
    {
      cwd: path.join(input.repoRoot, "backend"),
      env: input.env,
      windowsHide: true,
    },
  );
}

async function waitForReady(
  baseUrl: string,
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited before readiness check succeeded: ${stderr.slice(-800)}`);
    }
    if (await isReady(baseUrl)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`Backend readiness check timed out: ${stderr.slice(-800)}`);
}

async function isReady(baseUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(`${baseUrl}/ready`, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(800, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function stopBackend(
  child: ChildProcessWithoutNullStreams,
  lifecycle: BackendLifecycle,
): Promise<void> {
  lifecycle.intentionalStop = true;
  if (child.exitCode !== null) {
    return;
  }

  child.kill();
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 3_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
