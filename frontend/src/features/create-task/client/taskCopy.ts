import type { OutreachGenerationMode } from "@/types";

export interface TaskModeCopy {
  title: string;
  description: string;
}

const TASK_MODE_COPY: Record<OutreachGenerationMode, TaskModeCopy> = {
  template: {
    title: "直接套用模板",
    description: "直接按模板内容发给导师，适合统一表达。",
  },
  llm: {
    title: "AI 辅助写信",
    description: "以你的模板为基础，自动生成更贴近导师背景的一版草稿。",
  },
};

export const getTaskModeCopy = (mode: OutreachGenerationMode): TaskModeCopy =>
  TASK_MODE_COPY[mode];
