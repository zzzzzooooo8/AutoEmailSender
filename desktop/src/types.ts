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
  stop: () => Promise<void>;
};

export type UpdateStatus =
  | { state: "idle"; version: string }
  | { state: "checking"; version: string }
  | { state: "available"; version: string; nextVersion: string }
  | { state: "not_available"; version: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "downloaded"; version: string; nextVersion: string }
  | { state: "error"; version: string; message: string };
