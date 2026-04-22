import { describe, expect, it } from "vitest";
import { getWorkspaceNextStep } from "@/features/workspace/client/getWorkspaceNextStep";

describe("getWorkspaceNextStep", () => {
  it("prompts for the primary material first when none is selected", () => {
    expect(
      getWorkspaceNextStep({
        status: "matched",
        hasDraft: false,
        hasPrimaryMaterial: false,
      }),
    ).toMatchObject({
      title: "下一步：先选择用于分析的材料",
    });
  });

  it("prompts to generate a draft when the primary material exists but no draft has been generated", () => {
    expect(
      getWorkspaceNextStep({
        status: "matched",
        hasDraft: false,
        hasPrimaryMaterial: true,
      }),
    ).toMatchObject({
      title: "下一步：生成一版邮件草稿",
    });
  });

  it("prompts to confirm scheduled sending for scheduled tasks", () => {
    expect(
      getWorkspaceNextStep({
        status: "scheduled",
        hasDraft: true,
        hasPrimaryMaterial: true,
      }),
    ).toMatchObject({
      title: "下一步：确认是否保留定时发送",
    });
  });

  it("falls back to manual review before sending in other cases", () => {
    expect(
      getWorkspaceNextStep({
        status: "approved",
        hasDraft: true,
        hasPrimaryMaterial: true,
      }),
    ).toMatchObject({
      title: "下一步：人工检查后发送",
    });
  });

  it("still prefers generating a draft when scheduled tasks have no draft yet", () => {
    expect(
      getWorkspaceNextStep({
        status: "scheduled",
        hasDraft: false,
        hasPrimaryMaterial: true,
      }),
    ).toMatchObject({
      title: "下一步：生成一版邮件草稿",
    });
  });

  it("still prefers selecting materials when other conditions are otherwise ready", () => {
    expect(
      getWorkspaceNextStep({
        status: "scheduled",
        hasDraft: true,
        hasPrimaryMaterial: false,
      }),
    ).toMatchObject({
      title: "下一步：先选择用于分析的材料",
    });
  });
});
