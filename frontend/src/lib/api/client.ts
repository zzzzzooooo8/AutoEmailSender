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
    const message =
      typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
          ? data.message
          : typeof data === 'string' && data.trim()
            ? data
            : '请求失败';
    throw new ApiError(response.status, message);
  }

  return data as T;
};
