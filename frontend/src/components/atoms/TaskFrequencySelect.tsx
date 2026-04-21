import { NativeSelectField } from "@/components/atoms/NativeSelectField";

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
  return (
    <div className="flex flex-col gap-1">
      <NativeSelectField
        value={value}
        onChange={(event) => onChange(parseInt(event.target.value, 10))}
        shellClassName="min-h-9 rounded-lg"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </NativeSelectField>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
};
