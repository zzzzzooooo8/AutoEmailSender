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
    title: "创建身份",
    description: "配置发件身份。",
    nextActionHref: "/profile",
  },
  llm: {
    stage: "llm",
    title: "选择模型",
    description: "配置可用模型。",
    nextActionHref: "/profile",
  },
  materials: {
    stage: "materials",
    title: "准备材料",
    description: "上传主材料，用于匹配和写信。",
    nextActionHref: "/profile",
  },
  professors: {
    stage: "professors",
    title: "补充导师",
    description: "添加导师后可进入任务流程。",
    nextActionHref: "/professors",
  },
  first_task: {
    stage: "first_task",
    title: "创建首个任务",
    description: "选择导师并创建邮件任务。",
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
    description: "配置完成，可以开始使用。",
    completed: true,
    nextActionHref: "/workspace",
  };
};
