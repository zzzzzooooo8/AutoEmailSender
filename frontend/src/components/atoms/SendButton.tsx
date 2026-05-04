// components/atoms/SendButton.tsx纯粹的发送按钮原子
import { SendHorizonal } from 'lucide-react';

interface SendButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export const SendButton: React.FC<SendButtonProps> = ({ onClick, disabled }) => {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 text-stone-400 border border-stone-200 transition-all hover:bg-primary hover:text-white hover:border-primary disabled:opacity-50 disabled:pointer-events-none active:scale-95"
    >
      <SendHorizonal className="w-5 h-5" />
    </button>
  );
};