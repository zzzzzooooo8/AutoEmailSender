import type { OutreachGenerationMode } from "@/types";

export const buildBatchCreateConfirmDescription = (
  taskMode: OutreachGenerationMode,
  scheduleType: "immediate" | "scheduled",
) =>
  taskMode === "template"
    ? scheduleType === "scheduled"
      ? "将直接套用模板生成可发送内容，创建后会按批量定时窗口自动发送，不需要逐封手动设定时间。"
      : "将直接套用模板生成可发送内容，创建后会按立即发送策略发送。"
    : scheduleType === "scheduled"
      ? "将创建批量任务，后台生成 AI 改写草稿；AI 改写完成后仍需逐封审核通过，随后再按定时发送策略发送。"
      : "将创建批量任务，后台生成 AI 改写草稿；AI 改写完成后仍需逐封审核通过，再手动确认发送。";
