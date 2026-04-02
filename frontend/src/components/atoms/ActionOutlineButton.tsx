// components/atoms/ActionOutlineButton.tsx
import { ReactNode } from 'react';

interface ActionOutlineButtonProps {
  label: string;
  onClick?: () => void;
  icon?: ReactNode;
}

export const ActionOutlineButton: React.FC<ActionOutlineButtonProps> = ({ 
  label, 
  onClick, 
  icon 
}) => {
  // 💡 基础样式：冷静、克制。去掉 theme 属性。
  const baseStyles = "flex items-center gap-2 px-5 py-2 rounded-full border border-solid transition-all duration-200 font-medium text-sm";
  
  // 💡 💡 核心交互：平时灰框灰字，💡 Hover 时瞬间变为实心红底白字，增加反馈感
  const interactionStyles = "border-stone-300 text-stone-600 bg-white hover:border-primary hover:bg-primary hover:text-white hover:shadow-lg active:scale-95 transform-gpu";

  return (
    <button onClick={onClick} className={`${baseStyles} ${interactionStyles}`}>
      {icon}
      {label}
    </button>
  );
};