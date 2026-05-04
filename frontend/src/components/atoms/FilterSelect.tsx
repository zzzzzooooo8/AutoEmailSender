import { NativeSelectField } from "@/components/atoms/NativeSelectField";

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}

const ALL_FILTER_VALUE = "ALL";

export const FilterSelect: React.FC<FilterSelectProps> = ({
  id,
  label,
  value,
  allLabel,
  options,
  disabled = false,
  onChange,
}) => {
  return (
    <div className="min-w-0">
      <NativeSelectField
        id={id}
        label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        wrapperClassName="min-w-0"
        shellClassName="min-h-9 rounded-lg"
      >
        <option value={ALL_FILTER_VALUE}>{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelectField>
    </div>
  );
};
