import clsx from 'clsx';

export type TaskStatus = '运行中' | '已暂停' | '已完成';

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

export const TaskStatusBadge: React.FC<TaskStatusBadgeProps> = ({ status }) => {
  const baseStyles = 'px-3 py-1 text-xs font-semibold rounded-full border border-solid shrink-0';

  const statusStyles: Record<TaskStatus, string> = {
    运行中: 'bg-red-50 text-primary border-red-100',
    已暂停: 'bg-amber-50 text-amber-700 border-amber-200',
    已完成: 'bg-stone-100 text-stone-600 border-stone-200',
  };

  return (
    <span className={clsx(baseStyles, statusStyles[status])}>
      {status === '已暂停' && <span className="mr-1">⏸</span>}
      {status === '运行中' && <span className="mr-1 animate-pulse">●</span>}
      {status}
    </span>
  );
};
