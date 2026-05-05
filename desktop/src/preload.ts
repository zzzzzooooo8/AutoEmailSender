import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { BackendStatus, UpdateStatus } from "./types.js";

let backendBaseUrl = process.argv
  .find((value) => value.startsWith("--backend-base-url="))
  ?.replace("--backend-base-url=", "");
let currentBackendStatus: BackendStatus = { state: "starting" };
const backendStatusCallbacks = new Set<(status: BackendStatus) => void>();

ipcRenderer.on("backend:status", (_event: IpcRendererEvent, status: BackendStatus) => {
  currentBackendStatus = status;
  if (status.state === "ready") {
    backendBaseUrl = status.baseUrl;
  }
  backendStatusCallbacks.forEach((callback) => callback(status));
});

contextBridge.exposeInMainWorld("autoEmailSender", {
  backendBaseUrl,
  getBackendBaseUrl: () => backendBaseUrl,
  getVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>,
  checkForUpdate: () => ipcRenderer.invoke("update:check") as Promise<UpdateStatus>,
  downloadUpdate: (options?: { mode?: "differential" | "full" }) =>
    ipcRenderer.invoke("update:download", options) as Promise<UpdateStatus>,
  switchToFullDownload: () =>
    ipcRenderer.invoke("update:switch-to-full-download") as Promise<UpdateStatus>,
  quitAndInstall: () => ipcRenderer.invoke("update:quit-and-install") as Promise<void>,
  onBackendStatus: (callback: (status: BackendStatus) => void) => {
    backendStatusCallbacks.add(callback);
    queueMicrotask(() => callback(currentBackendStatus));
    return () => {
      backendStatusCallbacks.delete(callback);
    };
  },
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => {
      ipcRenderer.removeListener("update:status", listener);
    };
  },
});
