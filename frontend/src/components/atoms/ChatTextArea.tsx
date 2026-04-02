// components/atoms/ChatTextArea.tsx纯粹的文本输入原子
interface ChatTextAreaProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export const ChatTextArea: React.FC<ChatTextAreaProps> = ({ 
  value, onChange, placeholder, maxLength = 5000 
}) => {
  return (
    <div className="flex-1 flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full p-4 rounded-3xl border border-stone-200 bg-stone-50 focus:border-primary-light focus:ring-1 focus:ring-primary-light transition-colors resize-none text-stone-800 text-sm leading-relaxed"
      />
      <div className="text-right text-xs text-stone-400 font-medium px-2">
        {value.length} / {maxLength}
      </div>
    </div>
  );
};