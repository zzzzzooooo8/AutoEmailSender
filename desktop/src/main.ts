import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getFrontendIndexPath, startBackend } from "./backend.js";
import { checkForUpdatesOnStartup, registerUpdateIpc } from "./updates.js";
import { getWindowIconPath } from "./windowIcon.js";
import type { BackendController, BackendExit } from "./types.js";

let mainWindow: BrowserWindow | null = null;
let backend: BackendController | null = null;
let restartingBackend = false;

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
      additionalArguments: [`--backend-base-url=${backend.baseUrl}`],
    },
  });

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
  checkForUpdatesOnStartup();
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
  mainWindow?.webContents.send("backend:status", {
    state: "restarting",
    code: exit.code,
    signal: exit.signal,
  });

  try {
    backend = await startDesktopBackend();
    mainWindow?.webContents.send("backend:status", {
      state: "ready",
      baseUrl: backend.baseUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    mainWindow?.webContents.send("backend:status", {
      state: "error",
      message,
    });
  } finally {
    restartingBackend = false;
  }
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
