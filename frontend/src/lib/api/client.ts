export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const buildApiPath = (
  path: string,
  params?: Record<string, string | number | null | undefined>,
) => {
  const url = new URL(path, window.location.origin);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}`;
};

export const buildApiUrl = (
  path: string,
  params?: Record<string, string | number | null | undefined>,
) => new URL(buildApiPath(path, params), window.location.origin).toString();

const normalizeValidationMessage = (message: string) =>
  message.replace(/^Value error,\s*/i, "").trim();

const extractApiErrorMessage = (data: unknown) => {
  if (typeof data === "object" && data !== null && "detail" in data) {
    const detail = data.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }
          if (
            typeof item === "object" &&
            item !== null &&
            "msg" in item &&
            typeof item.msg === "string"
          ) {
            return normalizeValidationMessage(item.msg);
          }
          return "";
        })
        .filter(Boolean);
      if (messages.length > 0) {
        return messages.join("；");
      }
    }
  }
  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string" &&
    data.message.trim()
  ) {
    return data.message;
  }
  if (typeof data === "string" && data.trim()) {
    return data;
  }
  return "请求失败";
};

export const apiFetch = async <T>(
  path: string,
  options?: RequestInit,
  params?: Record<string, string | number | null | undefined>,
): Promise<T> => {
  const response = await fetch(buildApiPath(path, params), {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers ?? {}),
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, extractApiErrorMessage(data));
  }

  return data as T;
};
