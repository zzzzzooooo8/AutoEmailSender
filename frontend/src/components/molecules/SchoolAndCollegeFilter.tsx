import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import type { UniversitySchoolPair } from '@/features/mentor-filter/types';
import { ALL_FILTER_VALUE, MATCH_SCORE_RANGES, type MentorStatusFilter } from '@/features/mentor-filter/types';
import type { MentorStatus } from '@/types';

interface FilterDropdownProps<T extends string> {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}

const FilterDropdown = <T extends string>({ label, value, options, onChange }: FilterDropdownProps<T>) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label ?? label;

  return (
    <div className="relative flex flex-col gap-1" ref={ref}>
      <span className="text-xs font-semibold tracking-wide text-stone-500">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex h-9 items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 transition-all hover:border-stone-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <span className={value !== ALL_FILTER_VALUE ? 'font-medium text-primary' : ''}>{displayLabel}</span>
        <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-14 z-30 min-w-48 rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface SchoolAndCollegeFilterProps {
  selectedPairs: UniversitySchoolPair[];
  allPairs: UniversitySchoolPair[];
  activeFilterCount: number;
  title: string;
  titleOptions: string[];
  matchScoreRange: string;
  status: MentorStatusFilter;
  statusOptions: { label: string; value: MentorStatusFilter }[];
  onTogglePair: (pair: UniversitySchoolPair) => void;
  onTitleChange: (title: string) => void;
  onMatchScoreRangeChange: (range: string) => void;
  onStatusChange: (status: MentorStatusFilter) => void;
  onReset: () => void;
}

const toSearchKey = (text: string) => text.trim().toLowerCase();

export const SchoolAndCollegeFilter: React.FC<SchoolAndCollegeFilterProps> = ({
  selectedPairs,
  allPairs,
  activeFilterCount,
  title,
  titleOptions,
  matchScoreRange,
  status,
  statusOptions,
  onTogglePair,
  onTitleChange,
  onMatchScoreRangeChange,
  onStatusChange,
  onReset,
}) => {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setKeyword('');
      inputRef.current?.focus();
    }
  }, [open]);

  const filteredPairs = useMemo(() => {
    const kw = toSearchKey(keyword);
    if (kw.length === 0) return allPairs;
    return allPairs.filter(
      (pair) =>
        toSearchKey(pair.university).includes(kw) ||
        toSearchKey(pair.school).includes(kw),
    );
  }, [allPairs, keyword]);

  const triggerLabel = useMemo(() => {
    if (activeFilterCount <= 0) return '筛选';
    return `已选 ${activeFilterCount} 项`;
  }, [activeFilterCount]);

  const isPairSelected = (pair: UniversitySchoolPair) =>
    selectedPairs.some((p) => p.university === pair.university && p.school === pair.school);

  const handleRemovePair = (pair: UniversitySchoolPair, e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePair(pair);
  };

  const titleDropdownOptions = [
    { label: '全部', value: ALL_FILTER_VALUE },
    ...titleOptions.map((t) => ({ label: t, value: t })),
  ];

  const matchScoreDropdownOptions = MATCH_SCORE_RANGES.map((r) => ({
    label: r.label,
    value: r.value,
  }));

  const totalActiveCount =
    activeFilterCount +
    (title !== ALL_FILTER_VALUE ? 1 : 0) +
    (matchScoreRange !== ALL_FILTER_VALUE ? 1 : 0) +
    (status !== ALL_FILTER_VALUE ? 1 : 0);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition-all hover:border-primary hover:text-primary"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>{totalActiveCount > 0 ? `筛选(${totalActiveCount})` : triggerLabel}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-12 z-40 w-152 max-w-[calc(100vw-2rem)] rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-800">筛选导师</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              aria-label="关闭筛选面板"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 职称 / 满意度 / 状态 三个下拉 */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <FilterDropdown
              label="职称"
              value={title}
              options={titleDropdownOptions}
              onChange={onTitleChange}
            />
            <FilterDropdown
              label="满意度"
              value={matchScoreRange}
              options={matchScoreDropdownOptions}
              onChange={onMatchScoreRangeChange}
            />
            <FilterDropdown<MentorStatusFilter>
              label="状态"
              value={status}
              options={statusOptions}
              onChange={onStatusChange}
            />
          </div>

          {/* 学校/学院搜索 */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
            <input
              ref={inputRef}
              type="text"
              value={keyword}
              placeholder="搜索学校或学院..."
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
              }}
              className="h-9 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-3 text-sm text-stone-700 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* 已选 chips */}
          {selectedPairs.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selectedPairs.map((pair) => (
                <span
                  key={`${pair.university}\t${pair.school}`}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                >
                  {pair.university} / {pair.school}
                  <button
                    type="button"
                    onClick={(e) => handleRemovePair(pair, e)}
                    className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-primary/20"
                    aria-label={`移除 ${pair.university} / ${pair.school}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 选项列表 */}
          <div className="max-h-48 overflow-y-auto">
            {filteredPairs.length > 0 ? (
              filteredPairs.map((pair) => {
                const selected = isPairSelected(pair);
                return (
                  <button
                    key={`${pair.university}\t${pair.school}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onTogglePair(pair)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100 rounded-lg"
                  >
                    <span className="truncate">
                      <span className="font-medium">{pair.university}</span>
                      <span className="mx-1.5 text-stone-400">/</span>
                      <span className="text-stone-600">{pair.school}</span>
                    </span>
                    {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-4 text-center text-xs text-stone-400">无匹配结果</p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                onReset();
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:bg-stone-100"
            >
              重置全部
            </button>
          </div>
        </div>
      )}
    </div>
  );
};