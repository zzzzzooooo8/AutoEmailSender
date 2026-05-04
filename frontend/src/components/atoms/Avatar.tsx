//用于区分学生（居右）和导师（居左）。目前使用首字母缩写。
// components/atoms/Avatar.tsx
import clsx from 'clsx';

interface AvatarProps {
  initials: string;       // 头像缩写，如 "张"、"Me"
  variant?: 'mentor' | 'student'; // 区分导师和学生
  size?: 'sm' | 'md';
}

export const Avatar: React.FC<AvatarProps> = ({ initials, variant = 'mentor', size = 'md' }) => {
  const baseClasses = "flex items-center justify-center font-semibold rounded-full select-none shrink-0";
  
  const sizeClasses = {
    'sm': 'w-9 h-9 text-sm',
    'md': 'w-12 h-12 text-lg',
  };

  // 💡 视觉区分：导师使用更正式的燕麦灰底深灰字，学生使用红砖色系
  const variantClasses = {
    'mentor': 'bg-stone-100 text-stone-600 border border-stone-200',
    'student': 'bg-primary text-white',
  };

  return (
    <div className={clsx(baseClasses, sizeClasses[size], variantClasses[variant])}>
      {initials}
    </div>
  );
};