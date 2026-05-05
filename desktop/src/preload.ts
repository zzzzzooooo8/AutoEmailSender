import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { BackendStatus, UpdateStatus } from "./types.js";

const backendBaseUrl = process.argv
  .find((value) => value.startsWith("--backend-base-url="))
  ?.replace("--backend-base-url=", "");

contextBridge.exposeInMainWorld("autoEmailSender", {
  backendBaseUrl,
  getVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>,
  checkForUpdate: () => ipcRenderer.invoke("update:check") as Promise<UpdateStatus>,
  downloadUpdate: () => ipcRenderer.invoke("update:download") as Promise<UpdateStatus>,
  quitAndInstall: () => ipcRenderer.invoke("update:quit-and-install") as Promise<void>,
  onBackendStatus: (callback: (status: BackendStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: BackendStatus) => callback(status);
    ipcRenderer.on("backend:status", listener);
    return () => {
      ipcRenderer.removeListener("backend:status", listener);
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
