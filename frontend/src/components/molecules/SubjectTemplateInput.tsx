import { useId, useRef, useState } from "react";
import { Braces, ChevronDown } from "lucide-react";
import { FloatingMenuPortal } from "@/components/molecules/FloatingMenuPortal";
import {
  TEMPLATE_PLACEHOLDER_OPTIONS,
  type TemplatePlaceholderOption,
} from "@/lib/templatePlaceholders";

type SubjectTemplateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
};

export const SubjectTemplateInput = ({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  className = "block",
  inputClassName = "form-input pr-28",
}: SubjectTemplateInputProps) => {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const insertPlaceholder = (option: TemplatePlaceholderOption) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}${option.token}${value.slice(end)}`;
    const nextCursor = start + option.token.length;

    onChange(nextValue);
    setOpen(false);

    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <div className={className}>
      <label className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-stone-800" htmlFor={inputId}>
        {required ? <span className="text-base leading-none text-red-500">*</span> : null}
        <span>{label}</span>
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={inputClassName}
        />

        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="主题占位符菜单"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50"
          >
            <Braces className="h-3.5 w-3.5" />
            占位符
            <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
          </button>

          <FloatingMenuPortal
            open={open}
            anchorRef={menuButtonRef}
            align="right"
            minWidth={180}
            testId="subject-placeholder-menu"
            onClose={() => setOpen(false)}
          >
            {TEMPLATE_PLACEHOLDER_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-label={option.label}
                onClick={() => insertPlaceholder(option)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-50"
              >
                <span>{option.label}</span>
                <span className="font-mono text-xs text-stone-400">{option.token}</span>
              </button>
            ))}
          </FloatingMenuPortal>
        </div>
      </div>
    </div>
  );
};
