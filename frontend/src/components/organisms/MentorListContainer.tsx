import { MentorRowCard } from '../molecules/MentorRowCard';
import type { Mentor } from '../../types';

interface MentorListContainerProps {
  mentors: Mentor[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onInverseSelect: () => void;
  onWriteEmail: (id: string) => void;
}

export const MentorListContainer: React.FC<MentorListContainerProps> = ({
  mentors,
  selectedIds,
  onToggle,
  onSelectAll,
  onInverseSelect,
  onWriteEmail,
}) => {
  return (
    <div className="flex flex-col gap-5">
      {/* 全选/反选工具栏 */}
      <div className="flex items-center gap-4 px-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="text-sm text-stone-600 hover:text-primary transition-colors"
        >
          全选
        </button>
        <span className="text-stone-300">|</span>
        <button
          type="button"
          onClick={onInverseSelect}
          className="text-sm text-stone-600 hover:text-primary transition-colors"
        >
          反选
        </button>
        {selectedIds.size > 0 && (
          <span className="ml-2 text-sm text-stone-500">
            已选 {selectedIds.size} 项
          </span>
        )}
      </div>

      {mentors.map((mentor, index) => {
        const isEven = index % 2 !== 0;

        return (
          <MentorRowCard
            key={mentor.id}
            mentor={mentor}
            isEven={isEven}
            selected={selectedIds.has(mentor.id)}
            onToggle={onToggle}
            onWriteEmail={onWriteEmail}
          />
        );
      })}
    </div>
  );
};
