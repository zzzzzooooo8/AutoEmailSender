import type { CreateTaskFormData } from '../types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export const validateTaskForm = (data: CreateTaskFormData): ValidationResult => {
  const errors: Record<string, string> = {};

  if (!data.name.trim()) {
    errors.name = '请输入任务名称';
  } else if (data.name.trim().length < 3) {
    errors.name = '任务名称至少 3 个字符';
  }

  if (data.mentorIds.length === 0) {
    errors.mentors = '请至少选择一位导师';
  }

  if (!data.emailContent.subject.trim()) {
    errors.emailSubject = '请填写邮件主题';
  }
  if (!data.emailContent.body.trim()) {
    errors.emailBody = '请填写邮件正文';
  }

  if (data.schedule.type === 'scheduled') {
    if (!data.schedule.startTime) {
      errors.startTime = '请选择开始时间';
    }
    if (!data.schedule.endTime) {
      errors.endTime = '请选择结束时间';
    }
    if (
      data.schedule.startTime &&
      data.schedule.endTime &&
      data.schedule.endTime <= data.schedule.startTime
    ) {
      errors.endTime = '结束时间必须晚于开始时间';
    }
    if (!data.schedule.emailsToSend || data.schedule.emailsToSend <= 0) {
      errors.emailsToSend = '请输入要发送的邮件数量';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
};
