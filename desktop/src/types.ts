export type BackendPathInput = {
  isPackaged: boolean;
  resourcesPath: string;
  repoRoot: string;
};

export type BackendEnvInput = {
  baseEnv: NodeJS.ProcessEnv;
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

export type UpdateStatus =
  | { state: "idle"; version: string }
  | { state: "checking"; version: string }
  | { state: "available"; version: string; nextVersion: string }
  | { state: "not_available"; version: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "downloaded"; version: string; nextVersion: string }
  | { state: "error"; version: string; message: string };
