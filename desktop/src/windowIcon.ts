import path from "node:path";

type WindowIconPathOptions = {
  isPackaged: boolean;
  resourcesPath: string;
  repoRoot: string;
};

export function getWindowIconPath({
  isPackaged,
  resourcesPath,
  repoRoot,
}: WindowIconPathOptions): string {
  return isPackaged
    ? path.join(resourcesPath, "build", "icon.ico")
    : path.join(repoRoot, "desktop", "build", "icon.ico");
}
