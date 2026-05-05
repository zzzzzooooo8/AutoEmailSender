import type { DesktopUpdateDownloadMode, DesktopUpdateStatus } from "@/types/desktop";

export const isDesktopApp = () => Boolean(window.autoEmailSender);

export async function getDesktopAppVersion(): Promise<string> {
  const api = getDesktopApi();
  return api.getVersion();
}

export async function checkForDesktopUpdate() {
  const api = getDesktopApi();
  return api.checkForUpdate();
}

export async function downloadDesktopUpdate(mode: DesktopUpdateDownloadMode = "differential") {
  const api = getDesktopApi();
  return api.downloadUpdate({ mode });
}

export async function switchDesktopUpdateToFullDownload() {
  const api = getDesktopApi();
  return api.switchToFullDownload();
}

export async function installDownloadedDesktopUpdate(): Promise<void> {
  const api = getDesktopApi();
  await api.quitAndInstall();
}

export async function quitAndInstallDesktopUpdate(): Promise<void> {
  await installDownloadedDesktopUpdate();
}

export function onDesktopUpdateStatus(callback: (status: DesktopUpdateStatus) => void) {
  const api = window.autoEmailSender;
  if (!api) {
    return () => undefined;
  }
  return api.onUpdateStatus(callback);
}

function getDesktopApi(): NonNullable<typeof window.autoEmailSender> {
  if (!window.autoEmailSender) {
    throw new Error("当前不是桌面应用环境");
  }
  return window.autoEmailSender;
}
