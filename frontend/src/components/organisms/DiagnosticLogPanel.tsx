import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import {
  clearDiagnosticEvents,
  exportDiagnosticEvents,
  getDiagnosticEvents,
  type DiagnosticEvent,
} from "@/lib/diagnostics";
import {
  exportOperationLogs,
  listOperationLogs,
  type OperationLogDTO,
} from "@/lib/api/diagnosticsApi";

type FilterValue = "" | string;

const backendLogLimit = 20;
const frontendPreviewLimit = 6;
const backendPreviewLimit = 20;
const levelOptions = ["debug", "info", "warn", "error"];
const categoryOptions = ["user_action", "api", "frontend_error", "system"];

export const DiagnosticLogPanel = () => {
  const { notifyError, notifySuccess } = useNotification();
  const [frontendEvents, setFrontendEvents] = useState<DiagnosticEvent[]>(() =>
    getDiagnosticEvents(),
  );
  const [backendLogs, setBackendLogs] = useState<OperationLogDTO[]>([]);
  const [level, setLevel] = useState<FilterValue>("");
  const [category, setCategory] = useState<FilterValue>("");
  const [loadingBackendLogs, setLoadingBackendLogs] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const backendParams = useMemo(
    () => ({
      limit: backendLogLimit,
      level: level || undefined,
      category: category || undefined,
    }),
    [category, level],
  );

  const frontendPreview = useMemo(
    () => frontendEvents.slice(-frontendPreviewLimit).reverse(),
    [frontendEvents],
  );

  const backendPreview = useMemo(
    () => backendLogs.slice(0, backendPreviewLimit),
    [backendLogs],
  );

  useEffect(() => {
    let ignore = false;

    const loadBackendLogs = async () => {
      setLoadingBackendLogs(true);
      setBackendError(null);

      try {
        const response = await listOperationLogs(backendParams);
        if (!ignore) {
          setBackendLogs(response.items);
        }
      } catch {
        if (!ignore) {
          setBackendLogs([]);
          setBackendError("后端诊断日志暂时不可用");
        }
      } finally {
        if (!ignore) {
          setLoadingBackendLogs(false);
        }
      }
    };

    void loadBackendLogs();

    return () => {
      ignore = true;
    };
  }, [backendParams, refreshIndex]);

  const refreshLocalEvents = useCallback(() => {
    setFrontendEvents(getDiagnosticEvents());
  }, []);

  const handleRefresh = () => {
    refreshLocalEvents();
    setRefreshIndex((current) => current + 1);
  };

  const handleClearLocalLogs = () => {
    if (!window.confirm("确认清空本地诊断日志？")) {
      return;
    }

    clearDiagnosticEvents();
    setFrontendEvents([]);
    notifySuccess("本地诊断日志已清空");
  };

  const handleExport = async () => {
    setExporting(true);

    try {
      const frontend = JSON.parse(exportDiagnosticEvents());
      let backend: unknown;

      try {
        backend = await exportOperationLogs({
          level: level || undefined,
          category: category || undefined,
        });
      } catch (error) {
        backend = {
          exported_at: null,
          items: [],
          total: 0,
          error: getErrorMessage(error, "后端诊断日志导出失败"),
        };
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        frontend,
        backend,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `auto-email-diagnostics-${formatFilenameTimestamp(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      notifySuccess("诊断日志已导出");
    } catch (error) {
      notifyError("导出诊断日志失败", getErrorMessage(error, "请稍后重试"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-stone-900">诊断日志</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            排查创建任务、抓取和接口请求问题时，可导出日志给开发者。
          </p>
        </div>
        <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
          本地日志 {frontendEvents.length} 条
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block min-w-36">
          <span className="mb-2 block text-xs font-medium text-stone-500">
            Level
          </span>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">全部</option>
            {levelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-44">
          <span className="mb-2 block text-xs font-medium text-stone-500">
            Category
          </span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">全部</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loadingBackendLogs}
          className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingBackendLogs ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          刷新
        </button>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          导出诊断日志
        </button>
        <button
          type="button"
          onClick={handleClearLocalLogs}
          className="ui-btn-danger"
        >
          <Trash2 className="h-4 w-4" />
          清空本地日志
        </button>
      </div>

      {backendError ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {backendError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.85fr,1.15fr]">
        <LogSection
          title="前端本地日志"
          emptyText="暂无本地诊断事件。"
          rows={frontendPreview.map((event) => ({
            key: event.id,
            level: event.level,
            category: event.category,
            name: event.eventName,
            requestId: event.sessionId,
            createdAt: event.timestamp,
            message: event.message,
          }))}
        />
        <LogSection
          title="后端 Operation Logs"
          emptyText={
            loadingBackendLogs ? "正在加载后端日志..." : "暂无后端诊断日志。"
          }
          rows={backendPreview.map((log) => ({
            key: String(log.id),
            level: log.level,
            category: log.category,
            name: log.event_name,
            requestId: log.request_id,
            createdAt: log.created_at,
            message: log.message,
          }))}
        />
      </div>
    </section>
  );
};

function LogSection({
  title,
  emptyText,
  rows,
}: {
  title: string;
  emptyText: string;
  rows: Array<{
    key: string;
    level: string;
    category: string;
    name: string;
    requestId?: string | null;
    createdAt: string;
    message?: string | null;
  }>;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-[#fcfbf8] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-500">
          {rows.length} 条预览
        </span>
      </div>
      {rows.length > 0 ? (
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <article
              key={row.key}
              className="rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-stone-900 px-2.5 py-1 text-[11px] font-medium text-white">
                  {row.level}
                </span>
                <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-600">
                  {row.category}
                </span>
                {row.requestId ? (
                  <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-500">
                    {row.requestId}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 break-all font-medium text-stone-900">
                {row.name}
              </div>
              <div className="mt-1 text-xs text-stone-500">
                {formatDisplayDate(row.createdAt)}
              </div>
              {row.message ? (
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">
                  {summarize(row.message)}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-stone-200 bg-white/70 px-4 py-8 text-center text-sm text-stone-500">
          {emptyText}
        </div>
      )}
    </div>
  );
}

function summarize(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
}

function formatDisplayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatFilenameTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
