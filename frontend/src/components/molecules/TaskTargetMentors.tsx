import { GraduationCap } from 'lucide-react';
import type { Mentor } from '@/types';

interface TaskTargetMentorsProps {
  mentors: Mentor[];
}

export const TaskTargetMentors: React.FC<TaskTargetMentorsProps> = ({ mentors }) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-stone-700">目标导师</label>
        <span className="text-xs text-stone-500">{mentors.length} 人</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {mentors.map((mentor) => (
          <div
            key={mentor.id}
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600"
          >
            <GraduationCap className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-medium">{mentor.name}</span>
            <span className="text-stone-400">·</span>
            <span className="text-stone-400">{mentor.university}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
