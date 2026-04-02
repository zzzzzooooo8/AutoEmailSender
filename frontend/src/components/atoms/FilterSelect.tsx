import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}

const ALL_FILTER_VALUE = 'ALL';

interface SelectOption {
  label: string;
  value: string;
}

const toSearchKey = (text: string) => text.trim().toLowerCase();

export const FilterSelect: React.FC<FilterSelectProps> = ({
  id,
  label,
  value,
  allLabel,
  options,
  disabled = false,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');

  const selectedLabel = value === ALL_FILTER_VALUE ? allLabel : value;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) {
      setKeyword('');
    }
  }, [open]);

  const availableOptions = useMemo<SelectOption[]>(() => {
    const normalizedKeyword = toSearchKey(keyword);
    const filteredOptions =
      normalizedKeyword.length === 0
        ? options
        : options.filter((option) => toSearchKey(option).includes(normalizedKeyword));
    const shouldShowAllOption =
      normalizedKeyword.length === 0 || toSearchKey(allLabel).includes(normalizedKeyword);

    return [
      ...(shouldShowAllOption ? [{ label: allLabel, value: ALL_FILTER_VALUE }] : []),
      ...filteredOptions.map((option) => ({ label: option, value: option })),
    ];
  }, [allLabel, keyword, options]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const handleInputFocus = () => {
    if (!disabled) {
      setOpen(true);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-sm text-stone-700" ref={containerRef}>
      <label htmlFor={id} className="text-xs font-semibold tracking-wide text-stone-500">
        {label}
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
        <input
          id={id}
          type="text"
          disabled={disabled}
          value={open ? keyword : selectedLabel}
          placeholder={allLabel}
          onFocus={handleInputFocus}
          onChange={(event) => {
            setKeyword(event.target.value);
            if (!open) {
              setOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
            }

            if (event.key === 'Enter' && availableOptions.length > 0) {
              event.preventDefault();
              handleSelect(availableOptions[0].value);
            }
          }}
          className="h-9 w-full min-w-0 rounded-lg border border-stone-200 bg-white pl-8 pr-3 text-sm text-stone-700 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
        />

        {open && !disabled && (
          <div className="absolute left-0 top-10 z-20 max-h-48 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
            {availableOptions.length > 0 ? (
              availableOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option.value)}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-2 text-xs text-stone-400">无匹配结果</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
