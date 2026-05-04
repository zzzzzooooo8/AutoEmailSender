interface TaskToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export const TaskToggle: React.FC<TaskToggleProps> = ({ checked, onChange, label }) => {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className="h-5 w-9 rounded-full bg-stone-200 transition-colors peer-checked:bg-primary" />
        <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </div>
      <span className="text-sm text-stone-700">{label}</span>
    </label>
  );
};
