import { getDayDetail, isWorkday } from 'chinese-days';

export type DateRule = 'all' | 'weekdays' | 'mon-wed-fri' | 'weekends';
export type WorkdayStatus = 'workday' | 'rest' | 'adjusted-workday';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const isValidIsoDate = (value: string) => {
  if (!isoDatePattern.test(value)) {
    return false;
  }
  const date = toDate(value);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
};

export const normalizeScheduledDates = (dates: string[]) =>
  Array.from(new Set(dates.filter(isValidIsoDate))).sort();

const matchesRule = (date: Date, rule: DateRule) => {
  const isoDate = toIsoDate(date);
  const day = date.getUTCDay();
  if (rule === 'all') {
    return true;
  }
  if (rule === 'weekdays') {
    return isWorkday(isoDate);
  }
  if (rule === 'mon-wed-fri') {
    return day === 1 || day === 3 || day === 5;
  }
  return day === 0 || day === 6;
};

export const getWorkdayStatus = (date: string): WorkdayStatus => {
  const detail = getDayDetail(date);
  const day = toDate(date).getUTCDay();
  if (detail.work && (day === 0 || day === 6)) {
    return 'adjusted-workday';
  }
  return detail.work ? 'workday' : 'rest';
};

export const applyDateRule = (rule: DateRule, startDate: string, endDate: string) => {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || startDate > endDate) {
    return [];
  }

  const dates: string[] = [];
  const cursor = toDate(startDate);
  const end = toDate(endDate);
  while (cursor <= end) {
    if (matchesRule(cursor, rule)) {
      dates.push(toIsoDate(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

export const toggleScheduledDate = (dates: string[], date: string) => {
  if (!isValidIsoDate(date)) {
    return dates;
  }
  if (dates.includes(date)) {
    return dates.filter((item) => item !== date);
  }
  return normalizeScheduledDates([...dates, date]);
};
