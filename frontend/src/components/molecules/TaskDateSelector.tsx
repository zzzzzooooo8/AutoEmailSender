import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  applyDateRule,
  isValidIsoDate,
  normalizeScheduledDates,
  toggleScheduledDate,
  type DateRule,
} from '@/features/create-task/client/scheduleDates';

interface TaskDateSelectorProps {
  selectedDates: string[];
  onChange: (dates: string[]) => void;
}

const ruleLabels: Array<{ label: string; value: DateRule }> = [
  { label: '每天', value: 'all' },
  { label: '工作日', value: 'weekdays' },
  { label: '周一三五', value: 'mon-wed-fri' },
  { label: '周末', value: 'weekends' },
];

const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const fromIsoDate = (value: string) => new Date(`${value}T00:00:00Z`);

const getTodayIsoDate = () => {
  const today = new Date();
  return toIsoDate(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
};

const buildMonthDays = (monthDate: Date) => {
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const startOffset = (firstDay.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - startOffset));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
};

export const TaskDateSelector: React.FC<TaskDateSelectorProps> = ({
  selectedDates,
  onChange,
}) => {
  const [todayIso] = useState(() => getTodayIsoDate());
  const [rangeStart, setRangeStart] = useState(todayIso);
  const [rangeEnd, setRangeEnd] = useState(todayIso);
  const [visibleMonth, setVisibleMonth] = useState(() => fromIsoDate(todayIso));
  const [dateToAdd, setDateToAdd] = useState('');

  const normalizedSelectedDates = useMemo(
    () => normalizeScheduledDates(selectedDates),
    [selectedDates],
  );
  const selectedDateSet = useMemo(
    () => new Set(normalizedSelectedDates),
    [normalizedSelectedDates],
  );
  const monthDays = useMemo(() => buildMonthDays(visibleMonth), [visibleMonth]);

  const visibleYear = visibleMonth.getUTCFullYear();
  const visibleMonthIndex = visibleMonth.getUTCMonth();
  const monthLabel = `${visibleYear}年${visibleMonthIndex + 1}月`;

  const changeMonth = (offset: number) => {
    setVisibleMonth(new Date(Date.UTC(visibleYear, visibleMonthIndex + offset, 1)));
  };

  const handleRuleClick = (rule: DateRule) => {
    onChange(applyDateRule(rule, rangeStart, rangeEnd));
  };

  const handleDateClick = (date: Date) => {
    onChange(toggleScheduledDate(normalizedSelectedDates, toIsoDate(date)));
  };

  const handleAddDate = () => {
    if (!isValidIsoDate(dateToAdd)) {
      return;
    }

    onChange(toggleScheduledDate(normalizedSelectedDates, dateToAdd));
    const addedDate = fromIsoDate(dateToAdd);
    setVisibleMonth(new Date(Date.UTC(addedDate.getUTCFullYear(), addedDate.getUTCMonth(), 1)));
    setDateToAdd('');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-stone-700">发送日期</p>
          <p className="mt-1 text-xs text-stone-500">已选 {normalizedSelectedDates.length} 天</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-stone-500">
            起始日期
            <input
              type="date"
              value={rangeStart}
              onChange={(event) => setRangeStart(event.target.value)}
              className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 transition-all hover:border-stone-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-stone-500">
            结束日期
            <input
              type="date"
              value={rangeEnd}
              onChange={(event) => setRangeEnd(event.target.value)}
              className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 transition-all hover:border-stone-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ruleLabels.map((rule) => (
          <button
            key={rule.value}
            type="button"
            onClick={() => handleRuleClick(rule.value)}
            className="h-8 rounded-lg border border-stone-200 bg-stone-50 px-3 text-xs font-medium text-stone-600 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            {rule.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange([])}
          className="h-8 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-500 transition-all hover:border-stone-300 hover:text-stone-700"
        >
          清空重选
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="h-8 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-all hover:border-stone-300"
          >
            上月
          </button>
          <h3 className="text-sm font-semibold text-stone-700">{monthLabel}</h3>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="h-8 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-all hover:border-stone-300"
          >
            下月
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-1 text-xs font-medium text-stone-400">
              {label}
            </div>
          ))}
          {monthDays.map((date) => {
            const isoDate = toIsoDate(date);
            const isSelected = selectedDateSet.has(isoDate);
            const isOutsideMonth = date.getUTCMonth() !== visibleMonthIndex;
            const isToday = isoDate === todayIso;

            return (
              <button
                key={isoDate}
                type="button"
                onClick={() => handleDateClick(date)}
                aria-pressed={isSelected}
                className={clsx(
                  'flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-all',
                  isSelected
                    ? 'border-primary bg-primary text-white shadow-sm'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-primary/50 hover:bg-primary/5',
                  isOutsideMonth && !isSelected && 'text-stone-300',
                  isToday && !isSelected && 'border-primary/50 text-primary',
                )}
              >
                {date.getUTCDate()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-stone-200 pt-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-xs font-medium text-stone-500">
          添加范围外日期
          <input
            type="date"
            value={dateToAdd}
            onChange={(event) => setDateToAdd(event.target.value)}
            className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 transition-all hover:border-stone-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <button
          type="button"
          onClick={handleAddDate}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90"
        >
          添加/切换日期
        </button>
      </div>
    </div>
  );
};
