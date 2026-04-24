import type { WorkspaceTaskStatus } from "@/types";

export interface WorkspaceNextStepInput {
  status: WorkspaceTaskStatus;
  hasDraft: boolean;
  hasPrimaryMaterial: boolean;
}

export interface WorkspaceNextStep {
  title: string;
}

export const getWorkspaceNextStep = (
  input: WorkspaceNextStepInput,
): WorkspaceNextStep => {
  switch (input.status) {
    case "sent":
      return { title: "查看发送结果" };
    case "reply_detected":
      return { title: "处理导师回复" };
    case "send_failed":
      return { title: "查看失败原因并重试" };
    case "skipped":
      return { title: "查看跳过原因" };
    default:
      break;
  }

  if (!input.hasPrimaryMaterial) {
    return { title: "选择分析材料" };
  }

  if (!input.hasDraft) {
    return { title: "生成邮件草稿" };
  }

  if (input.status === "scheduled") {
    return { title: "确认发送时间" };
  }

  return { title: "检查后发送" };
};
