const HAS_TIMEZONE_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/i;

export const parseApiDateTime = (value: string) => {
  const normalized = HAS_TIMEZONE_SUFFIX.test(value) ? value : `${value}Z`;
  return new Date(normalized);
};

export const formatApiDateTime = (
  value: string,
  options?: Intl.DateTimeFormatOptions,
) =>
  parseApiDateTime(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
