import clsx from 'clsx';
import type { MentorStatus } from '@/types';

interface StatusBadgeProps {
  status: MentorStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const baseStyles = 'px-3 py-1 text-xs font-semibold rounded-full border border-solid whitespace-nowrap';

  const statusStyles: Record<MentorStatus, string> = {
    已回复: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    婉拒: 'bg-stone-100 text-stone-600 border-stone-200',
    待审核: 'bg-amber-50 text-amber-700 border-amber-200',
    已读: 'bg-sky-50 text-sky-700 border-sky-100',
    未发送: 'bg-primary-light text-primary border-primary-light',
  };

  return <span className={clsx(baseStyles, statusStyles[status])}>{status}</span>;
};
