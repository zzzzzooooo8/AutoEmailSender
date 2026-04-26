import { recordDiagnosticEvent } from "@/lib/diagnostics";

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
  const apiPath = buildApiPath(path, params);
  const diagnosticData = {
    method: (options?.method ?? "GET").toUpperCase(),
    path: stripQueryAndHash(apiPath),
  };
  const startedAt = now();

  try {
    const response = await fetch(apiPath, {
      ...options,
      headers: {
        ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options?.headers ?? {}),
      },
    });

    if (response.status === 204) {
      recordApiDiagnosticEvent({
        level: "info",
        eventName: "api.request_succeeded",
        data: {
          ...diagnosticData,
          status: response.status,
          durationMs: elapsedMs(startedAt),
        },
      });
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
      const message = getApiErrorMessage(data);
      recordApiDiagnosticEvent({
        level: "error",
        eventName: "api.request_failed",
        data: {
          ...diagnosticData,
          status: response.status,
          durationMs: elapsedMs(startedAt),
          message,
        },
      });
      throw new ApiError(response.status, message);
    }

    recordApiDiagnosticEvent({
      level: "info",
      eventName: "api.request_succeeded",
      data: {
        ...diagnosticData,
        status: response.status,
        durationMs: elapsedMs(startedAt),
      },
    });
    return data as T;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      recordApiDiagnosticEvent({
        level: "error",
        eventName: "api.request_errored",
        data: {
          ...diagnosticData,
          durationMs: elapsedMs(startedAt),
          error: getThrownErrorMessage(error),
        },
      });
    }
    throw error;
  }
};

function getApiErrorMessage(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    const detailMessage = formatDetailMessage(data.detail);
    if (detailMessage) {
      return detailMessage;
    }
  }

  if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  return '请求失败';
}

function formatDetailMessage(detail: unknown): string | undefined {
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (!Array.isArray(detail)) {
    return undefined;
  }

  for (const item of detail) {
    if (typeof item === 'object' && item !== null && 'msg' in item && typeof item.msg === 'string') {
      const location =
        'loc' in item && Array.isArray(item.loc)
          ? item.loc.filter((part) => typeof part === 'string' || typeof part === 'number').join('.')
          : '';
      return location ? `${location}: ${item.msg}` : item.msg;
    }

    if (typeof item === 'string' && item.trim()) {
      return item;
    }
  }

  return undefined;
}

function getThrownErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function recordApiDiagnosticEvent(input: {
  level: "info" | "error";
  eventName: "api.request_succeeded" | "api.request_failed" | "api.request_errored";
  data: Record<string, string | number>;
}): void {
  try {
    recordDiagnosticEvent({
      level: input.level,
      category: "api",
      eventName: input.eventName,
      data: input.data,
    });
  } catch {
    // Diagnostic failures should never change API behavior.
  }
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(now() - startedAt));
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function stripQueryAndHash(path: string): string {
  const url = new URL(path, window.location.origin);
  return url.pathname;
}
