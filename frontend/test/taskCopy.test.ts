import { describe, expect, it } from "vitest";
import { getTaskModeCopy } from "@/features/create-task/client/taskCopy";

describe("getTaskModeCopy", () => {
  it("returns the template mode copy", () => {
    expect(getTaskModeCopy("template")).toEqual({
      title: "直接套用模板",
      description: "直接按模板内容发给导师，适合统一表达。",
    });
  });

  it("returns the llm mode copy", () => {
    expect(getTaskModeCopy("llm")).toEqual({
      title: "AI 辅助写信",
      description: "以你的模板为基础，自动生成更贴近导师背景的一版草稿。",
    });
  });
});
