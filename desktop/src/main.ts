import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getFrontendIndexPath, startBackend } from "./backend.js";
import { checkForUpdatesOnStartup, registerUpdateIpc } from "./updates.js";
import type { BackendController } from "./types.js";

let mainWindow: BrowserWindow | null = null;
let backend: BackendController | null = null;

const repoRoot = path.resolve(app.getAppPath(), "..");

async function createWindow(): Promise<void> {
  backend = await startBackend({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot,
    userDataPath: app.getPath("userData"),
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist", "preload.js"),
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
