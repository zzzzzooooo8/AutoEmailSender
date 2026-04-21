import { useCallback, useState } from 'react';
import type { Mentor } from '@/types';
import type { ScheduleType, CreateTaskFormData, TaskScheduleConfig, EmailContent, Attachment } from '../types';

const createDefaultSchedule = (): TaskScheduleConfig => ({
  type: 'immediate',
});

export const useCreateTaskForm = (initialMentors: Mentor[]) => {
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState<TaskScheduleConfig>(createDefaultSchedule);
  const [emailContent, setEmailContent] = useState<EmailContent>({ subject: '', body: '' });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setScheduleType = useCallback((type: ScheduleType) => {
    setSchedule((prev) => ({
      ...prev,
      type,
      ...(type === 'immediate'
        ? {}
        : {
            startTime: prev.startTime ?? '09:00',
            endTime: prev.endTime ?? '18:00',
          }),
    }));
  }, []);

  const setStartTime = useCallback((time: string) => {
    setSchedule((prev) => ({ ...prev, startTime: time }));
  }, []);

  const setEndTime = useCallback((time: string) => {
    setSchedule((prev) => ({ ...prev, endTime: time }));
  }, []);

  const setEmailsToSend = useCallback((count: number) => {
    setSchedule((prev) => ({ ...prev, emailsToSend: count }));
  }, []);

  const updateEmailContent = useCallback((field: keyof EmailContent, value: string) => {
    setEmailContent((prev) => ({ ...prev, [field]: value }));
  }, []);

  const addAttachments = useCallback((files: Attachment[]) => {
    setAttachments((prev) => [...prev, ...files]);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const buildFormData = (): CreateTaskFormData => ({
    name,
    mentorIds: initialMentors.map((m) => m.id),
    schedule,
    emailContent,
    attachments,
  });

  return {
    name,
    setName,
    schedule,
    setScheduleType,
    setStartTime,
    setEndTime,
    setEmailsToSend,
    emailContent,
    updateEmailContent,
    attachments,
    addAttachments,
    removeAttachment,
    isSubmitting,
    setIsSubmitting,
    buildFormData,
  };
};
