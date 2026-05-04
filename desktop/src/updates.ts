import { app, BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import type { UpdateStatus } from "./types.js";

const require = createRequire(import.meta.url);
const electronUpdater = require("electron-updater") as typeof import("electron-updater");

let currentStatus: UpdateStatus = { state: "idle", version: "0.0.0" };

export function formatDownloadProgress(percent: number): number {
  return Math.round(percent * 10) / 10;
}

export function registerUpdateIpc(getWindow: () => BrowserWindow | null): void {
  const autoUpdater = getAutoUpdater();
  autoUpdater.autoDownload = false;
  currentStatus = { state: "idle", version: app.getVersion() };

  autoUpdater.on("checking-for-update", () =>
    publish(getWindow, { state: "checking", version: app.getVersion() }),
  );
  autoUpdater.on("update-available", (info) =>
    publish(getWindow, {
      state: "available",
      version: app.getVersion(),
      nextVersion: info.version,
    }),
  );
  autoUpdater.on("update-not-available", () =>
    publish(getWindow, { state: "not_available", version: app.getVersion() }),
  );
  autoUpdater.on("download-progress", (progress) =>
    publish(getWindow, {
      state: "downloading",
      version: app.getVersion(),
      percent: formatDownloadProgress(progress.percent),
    }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    publish(getWindow, {
      state: "downloaded",
      version: app.getVersion(),
      nextVersion: info.version,
    }),
  );
  autoUpdater.on("error", (error) =>
    publish(getWindow, {
      state: "error",
      version: app.getVersion(),
      message: error.message,
    }),
  );

  ipcMain.handle("update:check", async () => {
    if (!app.isPackaged) {
      currentStatus = { state: "not_available", version: app.getVersion() };
      return currentStatus;
    }
    await autoUpdater.checkForUpdates();
    return currentStatus;
  });

  ipcMain.handle("update:download", async () => {
    if (!app.isPackaged) {
      return currentStatus;
    }
    await autoUpdater.downloadUpdate();
    return currentStatus;
  });

  ipcMain.handle("update:quit-and-install", () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

export function checkForUpdatesOnStartup(): void {
  if (!app.isPackaged) {
    return;
  }
  setTimeout(() => {
    getAutoUpdater().checkForUpdates().catch(() => undefined);
  }, 3_000);
}

function getAutoUpdater(): typeof electronUpdater.autoUpdater {
  return electronUpdater.autoUpdater;
}

function publish(getWindow: () => BrowserWindow | null, status: UpdateStatus): void {
  currentStatus = status;
  getWindow()?.webContents.send("update:status", status);
}
