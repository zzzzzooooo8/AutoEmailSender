import { describe, expect, it } from "vitest";
import { getOnboardingState } from "@/features/onboarding/client/getOnboardingState";

describe("getOnboardingState", () => {
  it.each([
    [
      "identity",
      {
        hasIdentity: false,
        hasLlmProfile: false,
        hasPrimaryMaterial: false,
        hasProfessors: false,
        hasFirstTask: false,
      },
      {
        stage: "identity",
        title: "先创建身份",
        description: "先补齐发件身份，才能继续配置后续流程。",
        completed: false,
        nextActionHref: "/profile",
      },
    ],
    [
      "llm",
      {
        hasIdentity: true,
        hasLlmProfile: false,
        hasPrimaryMaterial: false,
        hasProfessors: false,
        hasFirstTask: false,
      },
      {
        stage: "llm",
        title: "先选择模型",
        description: "先配置一个可用的模型，后面才能生成草稿。",
        completed: false,
        nextActionHref: "/profile",
      },
    ],
    [
      "materials",
      {
        hasIdentity: true,
        hasLlmProfile: true,
        hasPrimaryMaterial: false,
        hasProfessors: false,
        hasFirstTask: false,
      },
      {
        stage: "materials",
        title: "先准备主材料",
        description: "先上传一份可分析的主材料，方便后续生成邮件内容。",
        completed: false,
        nextActionHref: "/profile",
      },
    ],
    [
      "professors",
      {
        hasIdentity: true,
        hasLlmProfile: true,
        hasPrimaryMaterial: true,
        hasProfessors: false,
        hasFirstTask: false,
      },
      {
        stage: "professors",
        title: "先补充导师",
        description: "先添加导师，才能开始进入工作区和批量任务流程。",
        completed: false,
        nextActionHref: "/professors",
      },
    ],
    [
      "first_task",
      {
        hasIdentity: true,
        hasLlmProfile: true,
        hasPrimaryMaterial: true,
        hasProfessors: true,
        hasFirstTask: false,
      },
      {
        stage: "first_task",
        title: "创建第一封邮件任务",
        description: "现在可以创建第一封邮件任务，看看整体流程是否顺畅。",
        completed: false,
        nextActionHref: "/create-task",
      },
    ],
    [
      "ready",
      {
        hasIdentity: true,
        hasLlmProfile: true,
        hasPrimaryMaterial: true,
        hasProfessors: true,
        hasFirstTask: true,
      },
      {
        stage: "ready",
        title: "已准备就绪",
        description: "身份、模型、材料和导师都已配置完成，可以直接开始使用。",
        completed: true,
        nextActionHref: "/workspace",
      },
    ],
  ])("returns the %s onboarding state", (_, input, expected) => {
    expect(getOnboardingState(input)).toEqual(expected);
  });

  it("prefers the earliest blocked stage when multiple prerequisites are missing", () => {
    expect(
      getOnboardingState({
        hasIdentity: true,
        hasLlmProfile: false,
        hasPrimaryMaterial: false,
        hasProfessors: false,
        hasFirstTask: false,
      }),
    ).toMatchObject({
      stage: "llm",
      title: "先选择模型",
      completed: false,
      nextActionHref: "/profile",
    });
  });
});
