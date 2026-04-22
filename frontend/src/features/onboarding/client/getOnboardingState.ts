export type OnboardingStage =
  | "identity"
  | "llm"
  | "materials"
  | "professors"
  | "first_task"
  | "ready";

export interface OnboardingStateInput {
  hasIdentity: boolean;
  hasLlmProfile: boolean;
  hasPrimaryMaterial: boolean;
  hasProfessors: boolean;
  hasFirstTask: boolean;
}

export interface OnboardingState {
  stage: OnboardingStage;
  title: string;
  description: string;
  completed: boolean;
  nextActionHref: string;
}

const ONBOARDING_STATES: Record<
  Exclude<OnboardingStage, "ready">,
  Omit<OnboardingState, "completed">
> = {
  identity: {
    stage: "identity",
    title: "先创建身份",
    description: "先补齐发件身份，才能继续配置后续流程。",
    nextActionHref: "/profile",
  },
  llm: {
    stage: "llm",
    title: "先选择模型",
    description: "先配置一个可用的模型，后面才能生成草稿。",
    nextActionHref: "/profile",
  },
  materials: {
    stage: "materials",
    title: "先准备主材料",
    description: "先上传一份可分析的主材料，方便后续生成邮件内容。",
    nextActionHref: "/profile",
  },
  professors: {
    stage: "professors",
    title: "先补充导师",
    description: "先添加导师，才能开始进入工作区和批量任务流程。",
    nextActionHref: "/professors",
  },
  first_task: {
    stage: "first_task",
    title: "创建第一封邮件任务",
    description: "现在可以创建第一封邮件任务，看看整体流程是否顺畅。",
    nextActionHref: "/create-task",
  },
};

export const getOnboardingState = (
  input: OnboardingStateInput,
): OnboardingState => {
  if (!input.hasIdentity) {
    return { ...ONBOARDING_STATES.identity, completed: false };
  }

  if (!input.hasLlmProfile) {
    return { ...ONBOARDING_STATES.llm, completed: false };
  }

  if (!input.hasPrimaryMaterial) {
    return { ...ONBOARDING_STATES.materials, completed: false };
  }

  if (!input.hasProfessors) {
    return { ...ONBOARDING_STATES.professors, completed: false };
  }

  if (!input.hasFirstTask) {
    return { ...ONBOARDING_STATES.first_task, completed: false };
  }

  return {
    stage: "ready",
    title: "已准备就绪",
    description: "身份、模型、材料和导师都已配置完成，可以直接开始使用。",
    completed: true,
    nextActionHref: "/workspace",
  };
};
