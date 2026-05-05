export type BackendPathInput = {
  isPackaged: boolean;
  resourcesPath: string;
  repoRoot: string;
};

export type BackendEnvInput = {
  baseEnv: NodeJS.ProcessEnv;
  isPackaged: boolean;
  resourcesPath: string;
  repoRoot: string;
  userDataPath: string;
};

export type BackendController = {
  baseUrl: string;
  ready: Promise<void>;
  stop: () => Promise<void>;
};

export type BackendExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

export type BackendExitHandler = (exit: BackendExit) => void;

export type BackendStatus =
  | { state: "starting" }
  | { state: "restarting"; code: number | null; signal: NodeJS.Signals | null }
  | { state: "ready"; baseUrl: string }
  | { state: "error"; message: string };

export type UpdateDownloadMode = "differential" | "full";

export type UpdateDownloadProgress = {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  remainingBytes: number;
  bytesPerSecond: number;
  remainingSeconds: number | null;
  mode: UpdateDownloadMode;
};

export type UpdateStatus =
  | { state: "idle"; version: string }
  | { state: "checking"; version: string }
  | { state: "available"; version: string; nextVersion: string; fullDownloadBytes?: number }
  | { state: "not_available"; version: string }
  | ({ state: "downloading"; version: string; nextVersion: string } & UpdateDownloadProgress)
  | ({ state: "slow_download_offered"; version: string; nextVersion: string; fullDownloadBytes?: number } & UpdateDownloadProgress)
  | { state: "downloaded_pending_install"; version: string; nextVersion: string; fullDownloadBytes?: number }
  | { state: "installing"; version: string; nextVersion: string }
  | { state: "error"; version: string; message: string };
