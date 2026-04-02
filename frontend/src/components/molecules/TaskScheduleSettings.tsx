import { TaskTimePicker } from '../atoms/TaskTimePicker';
import type { TaskScheduleConfig } from '@/features/create-task/types';

interface TaskScheduleSettingsProps {
  schedule: TaskScheduleConfig;
  onScheduleTypeChange: (type: 'immediate' | 'scheduled') => void;
  onStartTimeChange: (time: string) => void;
  onEndTimeChange: (time: string) => void;
  onEmailsToSendChange: (count: number) => void;
  errors: Record<string, string>;
}

export const TaskScheduleSettings: React.FC<TaskScheduleSettingsProps> = ({
  schedule,
  onScheduleTypeChange,
  onStartTimeChange,
  onEndTimeChange,
  onEmailsToSendChange,
  errors,
}) => {
  const isScheduled = schedule.type === 'scheduled';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6">
        <label className="text-sm font-semibold text-stone-700">发送策略</label>

        {/* 立即发送 */}
        <button
          type="button"
          onClick={() => onScheduleTypeChange('immediate')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            !isScheduled
              ? 'bg-primary text-white shadow-sm'
              : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300'
          }`}
        >
          立即发送
        </button>

        {/* 定时发送 */}
        <button
          type="button"
          onClick={() => onScheduleTypeChange('scheduled')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            isScheduled
              ? 'bg-primary text-white shadow-sm'
              : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300'
          }`}
        >
          定时发送
        </button>
      </div>

      {/* 定时配置 */}
      {isScheduled && (
        <div className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-stone-500">开始时间</span>
              <TaskTimePicker
                value={schedule.startTime ?? '09:00'}
                onChange={onStartTimeChange}
                error={errors.startTime}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-stone-500">结束时间</span>
              <TaskTimePicker
                value={schedule.endTime ?? '18:00'}
                onChange={onEndTimeChange}
                error={errors.endTime}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-stone-500">发送数量（封）</span>
              <input
                type="number"
                min={1}
                value={schedule.emailsToSend ?? ''}
                onChange={(e) => onEmailsToSendChange(parseInt(e.target.value, 10) || 0)}
                placeholder="例如 20"
                className="h-9 w-28 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 transition-all placeholder:text-stone-400 hover:border-stone-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {errors.emailsToSend && (
                <span className="text-xs text-red-500">{errors.emailsToSend}</span>
              )}
            </div>
          </div>

          {schedule.startTime && schedule.endTime && schedule.emailsToSend && (
            <p className="text-xs text-stone-500">
              将在 {schedule.startTime} 至 {schedule.endTime} 之间，均匀发送 {schedule.emailsToSend} 封邮件
            </p>
          )}
        </div>
      )}
    </div>
  );
};
