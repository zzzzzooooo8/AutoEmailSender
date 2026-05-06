import { describe, expect, it } from "vitest";
import { buildProfessorImportDialogOptions } from "../src/fileSelection.js";

describe("desktop file selection", () => {
  it("opens professor imports with an open-file dialog", () => {
    expect(buildProfessorImportDialogOptions()).toMatchObject({
      title: "选择导师导入文件",
      properties: ["openFile"],
      filters: [
        { name: "导师导入文件", extensions: ["csv", "xlsx"] },
      ],
    });
  });
});
