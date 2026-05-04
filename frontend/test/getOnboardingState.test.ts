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
        title: "创建身份",
        description: "配置发件身份。",
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
        title: "选择模型",
        description: "配置可用模型。",
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
        title: "准备材料",
        description: "上传主材料，用于匹配和写信。",
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
        title: "补充导师",
        description: "添加导师后可进入任务流程。",
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
        title: "创建首个任务",
        description: "选择导师并创建邮件任务。",
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
        description: "配置完成，可以开始使用。",
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
      title: "选择模型",
      completed: false,
      nextActionHref: "/profile",
    });
  });
});
