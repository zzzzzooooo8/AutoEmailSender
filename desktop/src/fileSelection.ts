import fs from "node:fs/promises";
import path from "node:path";
import { dialog, ipcMain, type OpenDialogOptions } from "electron";

export type SelectedImportFile = {
  name: string;
  type: string;
  data: ArrayBuffer;
};

const PROFESSOR_IMPORT_EXTENSIONS = ["csv", "xlsx"];

export function buildProfessorImportDialogOptions(): OpenDialogOptions {
  return {
    title: "选择导师导入文件",
    properties: ["openFile"],
    filters: [
      { name: "导师导入文件", extensions: PROFESSOR_IMPORT_EXTENSIONS },
    ],
  };
}

export function getImportFileMimeType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".csv") {
    return "text/csv";
  }
  if (extension === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

export function registerFileSelectionIpc(): void {
  ipcMain.handle("professors:select-import-file", async (): Promise<SelectedImportFile | null> => {
    const result = await dialog.showOpenDialog(buildProfessorImportDialogOptions());
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath);
    return {
      name: path.basename(filePath),
      type: getImportFileMimeType(filePath),
      data: content.buffer.slice(
        content.byteOffset,
        content.byteOffset + content.byteLength,
      ),
    };
  });
}
