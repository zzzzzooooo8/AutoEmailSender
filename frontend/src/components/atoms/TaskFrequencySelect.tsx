import { ChevronDown } from 'lucide-react';

interface TaskFrequencySelectProps {
  value: number;
  options: { label: string; value: number }[];
  onChange: (minutes: number) => void;
  error?: string;
}

export const TaskFrequencySelect: React.FC<TaskFrequencySelectProps> = ({
  value,
  options,
  onChange,
  error,
}) => {
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative flex flex-col gap-1">
      <div className="relative">
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 transition-all hover:border-stone-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <span className={value ? 'font-medium text-primary' : 'text-stone-400'}>
            {selected?.label ?? '选择频率'}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 text-stone-400" />
        </button>

        <select
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
};
