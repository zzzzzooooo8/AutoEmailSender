import { useState } from 'react';
import { ChevronDown, Clock } from 'lucide-react';

interface TaskTimePickerProps {
  value: string; // "HH:mm"
  onChange: (time: string) => void;
  error?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export const TaskTimePicker: React.FC<TaskTimePickerProps> = ({ value, onChange, error }) => {
  const [open, setOpen] = useState(false);

  const [hourStr, minuteStr] = value ? value.split(':') : ['09', '00'];
  const hour = parseInt(hourStr ?? '9', 10);
  const minute = parseInt(minuteStr ?? '0', 10);

  const handleHourChange = (h: number) => {
    onChange(`${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  };

  const handleMinuteChange = (m: number) => {
    onChange(`${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  return (
    <div className="relative flex flex-col gap-1">
      <div className="relative">
        <Clock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-stone-200 bg-white pl-8 pr-3 text-sm text-stone-700 transition-all hover:border-stone-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <span className={value ? 'font-medium text-primary' : 'text-stone-400'}>
            {value || '选择时间'}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 text-stone-400" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-12 z-30 flex gap-1 rounded-xl border border-stone-200 bg-white p-3 shadow-xl">
          {/* 小时 */}
          <div className="flex h-36 w-16 flex-col gap-1 overflow-y-auto rounded-lg bg-stone-50 p-1">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => handleHourChange(h)}
                className={`flex h-7 w-full items-center justify-center rounded-md text-xs font-medium transition-colors ${
                  h === hour
                    ? 'bg-primary text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {String(h).padStart(2, '0')}
              </button>
            ))}
          </div>

          <span className="flex items-center text-stone-400">:</span>

          {/* 分钟 */}
          <div className="flex h-36 w-16 flex-col gap-1 overflow-y-auto rounded-lg bg-stone-50 p-1">
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMinuteChange(m)}
                className={`flex h-7 w-full items-center justify-center rounded-md text-xs font-medium transition-colors ${
                  m === minute
                    ? 'bg-primary text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {String(m).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <span className="text-xs text-red-500">{error}</span>}

      {open && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
