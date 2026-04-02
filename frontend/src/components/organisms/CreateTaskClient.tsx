import { useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { TaskNameInput } from '../molecules/TaskNameInput';
import { TaskTargetMentors } from '../molecules/TaskTargetMentors';
import { TaskScheduleSettings } from '../molecules/TaskScheduleSettings';
import { TaskEmailContent } from '../molecules/TaskEmailContent';
import { TaskAttachments } from '../molecules/TaskAttachments';
import { TaskSubmitActions } from '../molecules/TaskSubmitActions';
import { useCreateTaskForm } from '@/features/create-task/client/useCreateTaskForm';
import { validateTaskForm } from '@/features/create-task/server/validateTaskForm';
import { createTask } from '@/lib/api/createTask';
import type { Mentor } from '@/types';

interface CreateTaskClientProps {
  mentors: Mentor[];
}

export const CreateTaskClient: React.FC<CreateTaskClientProps> = ({ mentors }) => {
  const navigate = useNavigate();
  const {
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
    errors,
    setError,
    clearErrors,
    clearError,
    buildFormData,
    isScheduleComplete,
  } = useCreateTaskForm(mentors);

  const handleSubmit = async () => {
    clearErrors();
    const formData = buildFormData();
    const validation = validateTaskForm(formData);

    if (!validation.valid) {
      Object.entries(validation.errors).forEach(([field, message]) => {
        setError(field, message);
      });
      return;
    }

    if (!isScheduleComplete) {
      setError('schedule', '请完善发送策略配置');
      return;
    }

    setIsSubmitting(true);
    try {
      await createTask({ ...formData, mentors });
      navigate('/tasks');
    } catch {
      setError('submit', '创建失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <div className="mx-auto max-w-2xl px-6 py-10">
        {/* 页面标题 */}
        <div className="mb-8 flex items-center gap-3">
          <div className="bg-primary/10 rounded-xl p-2">
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-800">新建批量任务</h1>
            <p className="text-sm text-stone-500">配置任务信息并开始自动化发送</p>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {/* 任务名称 */}
          <div className="rounded-2xl border border-stone-200 bg-[#FCFBF8] p-6 shadow-sm">
            <TaskNameInput
              value={name}
              onChange={setName}
              error={errors.name}
              onClearError={clearError}
            />
          </div>

          {/* 目标导师 */}
          <div className="rounded-2xl border border-stone-200 bg-[#FCFBF8] p-6 shadow-sm">
            <TaskTargetMentors mentors={mentors} />
          </div>

          {/* 发送策略 */}
          <div className="rounded-2xl border border-stone-200 bg-[#FCFBF8] p-6 shadow-sm">
            <TaskScheduleSettings
              schedule={schedule}
              onScheduleTypeChange={setScheduleType}
              onStartTimeChange={setStartTime}
              onEndTimeChange={setEndTime}
              onEmailsToSendChange={setEmailsToSend}
              errors={errors}
            />
          </div>

          {/* 邮件内容 */}
          <div className="rounded-2xl border border-stone-200 bg-[#FCFBF8] p-6 shadow-sm">
            <TaskEmailContent
              emailContent={emailContent}
              onUpdate={updateEmailContent}
              onClearError={clearError}
              errors={errors}
            />
          </div>

          {/* 附件 */}
          <div className="rounded-2xl border border-stone-200 bg-[#FCFBF8] p-6 shadow-sm">
            <TaskAttachments
              attachments={attachments}
              onAdd={addAttachments}
              onRemove={removeAttachment}
            />
          </div>

          {/* 提交错误 */}
          {errors.submit && (
            <p className="text-center text-sm text-red-500">{errors.submit}</p>
          )}

          {/* 操作按钮 */}
          <TaskSubmitActions
            isSubmitting={isSubmitting}
            onCancel={() => navigate('/')}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
};
