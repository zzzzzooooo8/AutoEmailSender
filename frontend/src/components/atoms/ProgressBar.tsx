import clsx from 'clsx';
import type { TaskStatus } from './TaskStatusBadge';

interface ProgressBarProps {
  current: number;
  total: number;
  status: TaskStatus;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total, status }) => {
  const percentage = Math.round((current / total) * 100) || 0;

  const fillColors: Record<TaskStatus, string> = {
    运行中: 'bg-primary',
    已暂停: 'bg-amber-500',
    已完成: 'bg-stone-400',
  };

  return (
    <div className="flex flex-col gap-2 w-full mt-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-stone-700">
          进度: {current} / {total} 封
        </span>
        <span className="text-stone-500 font-medium">{percentage}%</span>
      </div>
      <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden shadow-inner border border-stone-200/50">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', fillColors[status])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
