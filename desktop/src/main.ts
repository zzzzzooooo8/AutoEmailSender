import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getFrontendIndexPath, startBackend } from "./backend.js";
import { checkForUpdatesOnStartup, registerUpdateIpc } from "./updates.js";
import { getWindowIconPath } from "./windowIcon.js";
import type { BackendController, BackendExit, BackendStatus } from "./types.js";

let mainWindow: BrowserWindow | null = null;
let backend: BackendController | null = null;
let restartingBackend = false;
let currentBackendStatus: BackendStatus = { state: "starting" };

const repoRoot = path.resolve(app.getAppPath(), "..");

async function createWindow(): Promise<void> {
  backend = await startDesktopBackend();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: getWindowIconPath({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      repoRoot,
    }),
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist", "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.send("backend:status", currentBackendStatus);
  });
  publishBackendReady(backend);

  if (!app.isPackaged && process.argv.includes("--dev")) {
    await mainWindow.loadURL("http://127.0.0.1:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  const indexPath = getFrontendIndexPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot,
  });
  await mainWindow.loadURL(pathToFileURL(indexPath).toString());
}

async function startDesktopBackend(): Promise<BackendController> {
  return startBackend({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot,
    userDataPath: app.getPath("userData"),
    onUnexpectedExit: (exit) => {
      void restartBackendAfterUnexpectedExit(exit);
    },
  });
}

async function restartBackendAfterUnexpectedExit(exit: BackendExit): Promise<void> {
  if (restartingBackend || backend === null) {
    return;
  }

  restartingBackend = true;
  backend = null;
  publishBackendStatus({
    state: "restarting",
    code: exit.code,
    signal: exit.signal,
  });

  try {
    backend = await startDesktopBackend();
    publishBackendReady(backend);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    publishBackendStatus({
      state: "error",
      message,
    });
  } finally {
    restartingBackend = false;
  }
}

function publishBackendReady(controller: BackendController): void {
  publishBackendStatus({ state: "starting" });
  controller.ready
    .then(() => {
      publishBackendStatus({
        state: "ready",
        baseUrl: controller.baseUrl,
      });
      checkForUpdatesOnStartup();
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      publishBackendStatus({
        state: "error",
        message,
      });
    });
}

function publishBackendStatus(status: typeof currentBackendStatus): void {
  currentBackendStatus = status;
  mainWindow?.webContents.send("backend:status", status);
}

ipcMain.handle("app:get-version", () => app.getVersion());
registerUpdateIpc(() => mainWindow);

app.whenReady().then(() => {
  createWindow().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("启动失败", message);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  if (backend === null) {
    return;
  }
  event.preventDefault();
  const currentBackend = backend;
  backend = null;
  currentBackend.stop().finally(() => app.exit(0));
});
