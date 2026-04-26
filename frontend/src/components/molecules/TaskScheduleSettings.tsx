import { TaskTimePicker } from '../atoms/TaskTimePicker';
import { TaskDateSelector } from './TaskDateSelector';
import type { TaskScheduleConfig } from '@/features/create-task/types';

interface TaskScheduleSettingsProps {
  schedule: TaskScheduleConfig;
  onScheduleTypeChange: (type: 'immediate' | 'scheduled') => void;
  onStartTimeChange: (time: string) => void;
  onEndTimeChange: (time: string) => void;
  onEmailsToSendChange: (count: number) => void;
  onScheduledDatesChange: (dates: string[]) => void;
}

export const TaskScheduleSettings: React.FC<TaskScheduleSettingsProps> = ({
  schedule,
  onScheduleTypeChange,
  onStartTimeChange,
  onEndTimeChange,
  onEmailsToSendChange,
  onScheduledDatesChange,
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
        <div className="flex flex-col gap-5 border-t border-stone-200 pt-4">
          <TaskDateSelector
            selectedDates={schedule.scheduledDates ?? []}
            onChange={onScheduledDatesChange}
          />

          <div className="flex flex-col gap-4 border-t border-stone-200 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-stone-500">开始时间</span>
              <TaskTimePicker
                value={schedule.startTime ?? '09:00'}
                onChange={onStartTimeChange}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-stone-500">结束时间</span>
              <TaskTimePicker
                value={schedule.endTime ?? '18:00'}
                onChange={onEndTimeChange}
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
            </div>
          </div>

          {schedule.startTime && schedule.endTime && schedule.emailsToSend && (
            <p className="text-xs text-stone-500">
              已选 {schedule.scheduledDates?.length ?? 0} 天，将在 {schedule.startTime} 至{' '}
              {schedule.endTime} 之间动态发送，每天最多 {schedule.emailsToSend} 封
            </p>
          )}
        </div>
      )}
    </div>
  );
};
