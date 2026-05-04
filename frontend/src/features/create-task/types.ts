import type { Mentor } from '@/types';

export type ScheduleType = 'immediate' | 'scheduled';

export interface TaskScheduleConfig {
  type: ScheduleType;
  /** 定时发送时为 "HH:mm" 格式，开始时间 */
  startTime?: string;
  /** 定时发送时为 "HH:mm" 格式，结束时间 */
  endTime?: string;
  /** 在开始至结束时间内，发送多少封 */
  emailsToSend?: number;
  /** 定时发送时最终选中的发送日期，YYYY-MM-DD */
  scheduledDates?: string[];
}

export interface Attachment {
  name: string;
  size: number;
  url: string;
}

export interface EmailContent {
  subject: string;
  body: string;
}

export interface CreateTaskFormData {
  name: string;
  mentorIds: string[];
  schedule: TaskScheduleConfig;
  emailContent: EmailContent;
  attachments: Attachment[];
}

export interface CreateTaskPayload extends CreateTaskFormData {
  mentors: Mentor[];
}
