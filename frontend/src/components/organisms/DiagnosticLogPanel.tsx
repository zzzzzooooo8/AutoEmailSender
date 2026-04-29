import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type TransitionEvent,
} from "react";
import {
  ChevronDown,
  Download,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { safeRecordUserAction } from "@/lib/diagnosticUserActions";
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

interface DiagnosticExportPayload {
  exportedAt: string;
  sessionId: string;
  events: DiagnosticEvent[];
}

const backendLogLimit = 20;
const levelOptions = [
  { value: "debug", label: "debug（通用）" },
  { value: "info", label: "info（通用）" },
  { value: "warn", label: "warn（前端）" },
  { value: "warning", label: "warning（后端）" },
  { value: "error", label: "error（通用）" },
];
const categoryOptions = [
  { value: "user_action", label: "user_action（前端/后端）" },
  { value: "api", label: "api（前端）" },
  { value: "frontend_error", label: "frontend_error（前端）" },
  { value: "system", label: "system（前端）" },
  { value: "email", label: "email（后端）" },
  { value: "crawler", label: "crawler（后端）" },
  { value: "backend", label: "backend（后端）" },
];

export const DiagnosticLogPanel = () => {
  const { notifyError, notifySuccess } = useNotification();
  const [frontendEvents, setFrontendEvents] = useState<DiagnosticEvent[]>(() =>
    getDiagnosticEvents(),
  );
  const [backendLogs, setBackendLogs] = useState<OperationLogDTO[]>([]);
  const [level, setLevel] = useState<FilterValue>("");
  const [category, setCategory] = useState<FilterValue>("");
  const [exportDate, setExportDate] = useState(() =>
    formatDateInputValue(new Date()),
  );
  const [loadingBackendLogs, setLoadingBackendLogs] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [renderContent, setRenderContent] = useState(false);

  const exportDateRange = useMemo(
    () => getLocalDateRange(exportDate),
    [exportDate],
  );

  const backendParams = useMemo(
    () => ({
      limit: backendLogLimit,
      level: level || undefined,
      category: category || undefined,
      start_at: exportDateRange?.startAt,
      end_at: exportDateRange?.endAt,
    }),
    [category, exportDateRange, level],
  );

  useEffect(() => {
    if (!isExpanded) {
      return undefined;
    }

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
  }, [backendParams, isExpanded, refreshIndex]);

  const refreshLocalEvents = useCallback(() => {
    setFrontendEvents(getDiagnosticEvents());
  }, []);

  const filteredFrontendEvents = useMemo(
    () => filterEventsByDate(frontendEvents, exportDate),
    [exportDate, frontendEvents],
  );

  const toggleExpanded = () => {
    refreshLocalEvents();
    setRenderContent(true);
    setIsExpanded((current) => !current);
  };

  const handleContentTransitionEnd = (
    event: TransitionEvent<HTMLDivElement>,
  ) => {
    if (isExpanded || event.propertyName !== "grid-template-rows") {
      return;
    }
    setRenderContent(false);
  };

  const handleRefresh = () => {
    refreshLocalEvents();
    setRefreshIndex((current) => current + 1);
  };

  const handleClearLocalLogs = () => {
    if (!window.confirm("确认清空本地诊断日志？")) {
      return;
    }

    clearDiagnosticEvents();
    safeRecordUserAction({
      eventName: "diagnostics.local_logs_cleared",
    });
    refreshLocalEvents();
    notifySuccess("本地诊断日志已清空");
  };

  const handleExport = async () => {
    setExporting(true);

    try {
      const frontend = JSON.parse(
        exportDiagnosticEvents(),
      ) as DiagnosticExportPayload;
      const selectedFrontendEvents = filterEventsByDate(
        frontend.events ?? [],
        exportDate,
      );
      const frontendPayload: DiagnosticExportPayload = {
        ...frontend,
        events: selectedFrontendEvents,
      };
      let backend: unknown;

      try {
        backend = await exportOperationLogs({
          level: level || undefined,
          category: category || undefined,
          start_at: exportDateRange?.startAt,
          end_at: exportDateRange?.endAt,
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
        selectedDate: exportDate || null,
        frontend: frontendPayload,
        backend,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `auto-email-diagnostics-${exportDate || formatFilenameTimestamp(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      safeRecordUserAction({
        eventName: "diagnostics.export_succeeded",
        data: {
          selectedDate: exportDate || null,
          frontendCount: selectedFrontendEvents.length,
          backendCount:
            typeof backend === "object" &&
            backend !== null &&
            "total" in backend
              ? Number((backend as { total?: unknown }).total ?? 0)
              : 0,
        },
      });
      notifySuccess("诊断日志已导出");
    } catch (error) {
      const message = getErrorMessage(error, "请稍后重试");
      safeRecordUserAction({
        eventName: "diagnostics.export_failed",
        message,
        level: "error",
      });
      notifyError("导出诊断日志失败", message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls="diagnostic-log-panel-content"
        onClick={toggleExpanded}
        className="collapsible-card-toggle flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-stone-50 active:bg-stone-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-stone-900">
              开发诊断日志
            </h2>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
              本地 {frontendEvents.length} 条
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            排查问题时导出给开发者使用，不作为普通用户内容展示。
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-stone-500 transition-transform ${
            isExpanded ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>

      {renderContent ? (
        <div
          id="diagnostic-log-panel-content"
          data-state={isExpanded ? "open" : "closed"}
          onTransitionEnd={handleContentTransitionEnd}
          className="collapsible-card-content"
        >
          <div className="min-h-0 px-6 pb-6">
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <SummaryMetric
                label="本地事件"
                value={filteredFrontendEvents.length}
              />
              <SummaryMetric
                label="后端日志"
                value={loadingBackendLogs ? "加载中" : backendLogs.length}
              />
              <SummaryMetric label="导出日期" value={exportDate || "全部"} />
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-3">
              <label className="block min-w-40">
                <span className="mb-2 block text-xs font-medium text-stone-500">
                  导出日期
                </span>
                <input
                  type="date"
                  value={exportDate}
                  onChange={(event) => setExportDate(event.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
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
                    <option key={option.value} value={option.value}>
                      {option.label}
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
                    <option key={option.value} value={option.value}>
                      {option.label}
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
          </div>
        </div>
      ) : null}
    </section>
  );
};

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-stone-900">
        {value}
      </div>
    </div>
  );
}

function filterEventsByDate(
  events: DiagnosticEvent[],
  selectedDate: string,
): DiagnosticEvent[] {
  if (!selectedDate) {
    return events;
  }

  return events.filter((event) => {
    const eventDate = new Date(event.timestamp);
    if (Number.isNaN(eventDate.getTime())) {
      return false;
    }
    return formatDateInputValue(eventDate) === selectedDate;
  });
}

function getLocalDateRange(
  selectedDate: string,
): { startAt: string; endAt: string } | undefined {
  if (!selectedDate) {
    return undefined;
  }

  const startAt = new Date(`${selectedDate}T00:00:00`);
  if (Number.isNaN(startAt.getTime())) {
    return undefined;
  }

  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 1);
  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

function formatDateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
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
