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
      return { title: "下一步：查看发送结果" };
    case "reply_detected":
      return { title: "下一步：处理导师回复" };
    case "send_failed":
      return { title: "下一步：查看失败原因并重试" };
    case "skipped":
      return { title: "下一步：查看跳过原因" };
    default:
      break;
  }

  if (!input.hasPrimaryMaterial) {
    return { title: "下一步：先选择用于分析的材料" };
  }

  if (!input.hasDraft) {
    return { title: "下一步：生成一版邮件草稿" };
  }

  if (input.status === "scheduled") {
    return { title: "下一步：确认是否保留定时发送" };
  }

  return { title: "下一步：人工检查后发送" };
};
