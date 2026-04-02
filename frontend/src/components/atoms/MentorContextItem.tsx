// components/atoms/MentorContextItem.tsx
//用于左侧 30% 面板显示匹配度、职称等数据的单一条目。
import { ReactNode } from 'react';

interface MentorContextItemProps {
  label: string;
  value: string | ReactNode; // 可以是文本或标签组件
}

export const MentorContextItem: React.FC<MentorContextItemProps> = ({ label, value }) => {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-stone-100 last:border-b-0">
      <span className="text-sm text-stone-500">{label}</span>
      {/* 💡 默认值使用更深一号的暖灰，突出数据本身 */}
      <span className="text-sm font-semibold text-stone-800 truncate pl-4">
        {value}
      </span>
    </div>
  );
};