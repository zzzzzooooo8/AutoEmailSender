import type { OutreachGenerationMode } from "@/types";

export interface TaskModeCopy {
  title: string;
  description: string;
}

const TASK_MODE_COPY: Record<OutreachGenerationMode, TaskModeCopy> = {
  template: {
    title: "直接套用模板",
    description: "按模板生成邮件，适合统一话术。",
  },
  llm: {
    title: "AI 辅助写信",
    description: "基于模板生成个性化草稿。",
  },
};

export const getTaskModeCopy = (mode: OutreachGenerationMode): TaskModeCopy =>
  TASK_MODE_COPY[mode];
