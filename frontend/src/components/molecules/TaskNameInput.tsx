interface TaskNameInputProps {
  value: string;
  onChange: (value: string) => void;
  onClearError: (field: string) => void;
  error?: string;
}

export const TaskNameInput: React.FC<TaskNameInputProps> = ({
  value,
  onChange,
  onClearError,
  error,
}) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-stone-700">任务名称</label>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); onClearError('name'); }}
        placeholder="例如：清北复交系统架构方向首轮套磁"
        className="h-10 w-full rounded-xl border border-stone-200 bg-white px-4 text-sm text-stone-700 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
};
