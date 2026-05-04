import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';

type TopBarSelectOption = {
  value: number | string;
  label: string;
};

type TopBarSelectMenuProps = {
  icon?: ReactNode;
  placeholder: string;
  value: number | string | null;
  options: TopBarSelectOption[];
  disabled?: boolean;
  className?: string;
  onChange: (value: number | string) => void;
};

export const TopBarSelectMenu = ({
  icon,
  placeholder,
  value,
  options,
  disabled,
  className,
  onChange,
}: TopBarSelectMenuProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const shouldScroll = options.length > 6;

  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value ?? '')),
    [options, value],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div ref={rootRef} className={clsx('relative min-w-[12rem]', className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={handleButtonKeyDown}
        className={clsx(
          'flex min-h-[2.7rem] w-full items-center gap-2.5 rounded-2xl border border-stone-200/90 bg-white/92 px-3 py-2 text-left text-stone-700 shadow-sm shadow-stone-200/45 backdrop-blur-sm transition',
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'hover:border-stone-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15',
          open && 'border-primary/45 bg-white shadow-lg shadow-stone-300/30 ring-2 ring-primary/10',
        )}
      >
        {icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
            {icon}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="shrink-0 text-[11px] font-medium tracking-[0.03em] text-stone-500">{placeholder}</div>
          <div className="truncate text-[13px] font-medium leading-5 text-stone-900">
            {selectedOption?.label ?? `请选择${placeholder}`}
          </div>
        </div>
        <ChevronDown
          className={clsx(
            'h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="listbox"
          className="absolute right-0 top-[calc(100%+0.45rem)] z-50 min-w-full overflow-hidden rounded-2xl border border-stone-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,249,0.96))] p-1 shadow-[0_18px_36px_-24px_rgba(41,37,36,0.34)] backdrop-blur-xl"
        >
          <div className={clsx(shouldScroll && 'max-h-60 overflow-y-auto pr-0.5')}>
            {options.map((option) => {
              const selected = String(option.value) === String(value ?? '');
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    buttonRef.current?.blur();
                  }}
                  className={clsx(
                    'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] leading-5 transition',
                    selected
                      ? 'bg-primary text-white shadow-sm shadow-primary/25'
                      : 'text-stone-700 hover:bg-stone-100/90 hover:text-stone-900',
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
