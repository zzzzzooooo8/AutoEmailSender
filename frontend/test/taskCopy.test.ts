import { describe, expect, it } from "vitest";
import { getTaskModeCopy } from "@/features/create-task/client/taskCopy";

describe("getTaskModeCopy", () => {
  it("returns the template mode copy", () => {
    expect(getTaskModeCopy("template")).toEqual({
      title: "直接套用模板",
      description: "按模板生成邮件，适合统一话术。",
    });
  });

  it("returns the llm mode copy", () => {
    expect(getTaskModeCopy("llm")).toEqual({
      title: "AI 辅助写信",
      description: "基于模板生成个性化草稿。",
    });
  });
});
