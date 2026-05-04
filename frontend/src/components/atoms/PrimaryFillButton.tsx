// components/atoms/PrimaryFillButton.tsx
import { ReactNode } from 'react';

interface PrimaryFillButtonProps {
  label: string;
  onClick?: () => void;
  icon?: ReactNode;
}

export const PrimaryFillButton: React.FC<PrimaryFillButtonProps> = ({ label, onClick, icon }) => {
  return (
    <button 
      onClick={onClick}
      // 💡 增强点：加入了 duration-300 平滑过渡，上浮效果，以及红砖色的专属发光阴影
      className="flex items-center gap-2.5 px-6 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-md transition-all duration-300 hover:bg-primary-dark hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:scale-95 transform-gpu"
    >
      {icon}
      {label}
    </button>
  );
};