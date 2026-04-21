import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { NativeSelectField } from "@/components/atoms/NativeSelectField";
import {
  ALL_FILTER_VALUE,
  MATCH_SCORE_RANGES,
  type MentorStatusFilter,
  type UniversitySchoolPair,
} from "@/features/mentor-filter/types";

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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalActiveCount = useMemo(
    () =>
      activeFilterCount +
      (title !== ALL_FILTER_VALUE ? 1 : 0) +
      (matchScoreRange !== ALL_FILTER_VALUE ? 1 : 0) +
      (status !== ALL_FILTER_VALUE ? 1 : 0),
    [activeFilterCount, matchScoreRange, status, title],
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition-all hover:border-primary hover:text-primary"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>{totalActiveCount > 0 ? `筛选（${totalActiveCount}）` : "筛选"}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 top-12 z-40 w-[32rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-800">筛选导师</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="text-sm text-stone-700">
              <NativeSelectField
                label="职称"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                shellClassName="min-h-9 rounded-lg"
              >
                <option value={ALL_FILTER_VALUE}>全部</option>
                {titleOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </NativeSelectField>
            </div>

            <div className="text-sm text-stone-700">
              <NativeSelectField
                label="匹配分数"
                value={matchScoreRange}
                onChange={(event) => onMatchScoreRangeChange(event.target.value)}
                shellClassName="min-h-9 rounded-lg"
              >
                {MATCH_SCORE_RANGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </NativeSelectField>
            </div>

            <div className="text-sm text-stone-700">
              <NativeSelectField
                label="状态"
                value={status}
                onChange={(event) =>
                  onStatusChange(event.target.value as MentorStatusFilter)
                }
                shellClassName="min-h-9 rounded-lg"
              >
                {statusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </NativeSelectField>
            </div>
          </div>

          <div className="mt-4 max-h-48 overflow-y-auto rounded-2xl border border-stone-100">
            {allPairs.map((pair) => {
              const selected = selectedPairs.some(
                (item) => item.university === pair.university && item.school === pair.school,
              );
              return (
                <button
                  key={`${pair.university}-${pair.school}`}
                  type="button"
                  onClick={() => onTogglePair(pair)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-stone-700 hover:bg-stone-50"
                >
                  <span>
                    {pair.university} / {pair.school}
                  </span>
                  {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {selectedPairs.map((pair) => (
                <span
                  key={`${pair.university}-${pair.school}`}
                  className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {pair.university}/{pair.school}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:bg-stone-100"
            >
              重置全部
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
