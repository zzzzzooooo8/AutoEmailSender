export {};

export type DesktopUpdateStatus =
  | { state: "idle"; version: string }
  | { state: "checking"; version: string }
  | { state: "available"; version: string; nextVersion: string }
  | { state: "not_available"; version: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "downloaded"; version: string; nextVersion: string }
  | { state: "error"; version: string; message: string };

declare global {
  interface Window {
    autoEmailSender?: {
      backendBaseUrl?: string;
      getVersion: () => Promise<string>;
      checkForUpdate: () => Promise<DesktopUpdateStatus>;
      downloadUpdate: () => Promise<DesktopUpdateStatus>;
      quitAndInstall: () => Promise<void>;
      onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
    };
  }
}
