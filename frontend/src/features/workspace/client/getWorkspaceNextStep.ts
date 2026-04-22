export type WorkspaceTaskStatus =
  | "discovered"
  | "matched"
  | "draft_generated"
  | "review_required"
  | "approved"
  | "scheduled"
  | "sent"
  | "send_failed"
  | "reply_detected"
  | "skipped";

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
