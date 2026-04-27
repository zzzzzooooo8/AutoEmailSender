import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  FileSearch,
  Loader2,
  Mail,
  Pause,
  Play,
  Square,
  X,
} from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useSelectionContext } from "@/context/SelectionContext";
import { useConfirmDialog } from "@/lib/useConfirmDialog";
import { safeRecordUserAction } from "@/lib/diagnosticUserActions";
import {
  listBatchTasks,
  listBatchTaskItems,
  pauseBatchTask,
  resumeBatchTask,
  stopBatchTask,
} from "@/lib/api/batchTasksApi";
import {
  cancelCrawlJob,
  approveCrawlCandidates,
  getCrawlJobEvents,
  listCrawlCandidates,
  listCrawlJobs,
  listCrawlPages,
  updateCrawlCandidate,
} from "@/lib/api/crawlJobsApi";
import {
  buildCandidateReviewPayload,
  getReviewableCandidateIds,
  pruneSelectedCandidateIds,
} from "@/features/crawl-review/client/reviewCandidates";
import {
  BATCH_TASK_STATUS_LABELS,
  PROFESSOR_STATUS_LABELS,
  type BatchTaskCardDTO,
  type BatchTaskItemDTO,
  type CrawlCandidateDTO,
  type CrawlCandidateReviewStatusDTO,
  type CrawlJobEventDTO,
  type CrawlJobStatusDTO,
  type CrawlJobSummaryDTO,
  type CrawlPageDTO,
  type WorkspaceTaskStatus,
} from "@/types";

type TasksTab = "batch" | "crawl";

const CRAWL_JOB_STATUS_LABELS: Record<CrawlJobStatusDTO, string> = {
  queued: "排队中",
  running: "运行中",
  needs_review: "待审核",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
};

const CRAWL_JOB_STATUS_TONES: Record<CrawlJobStatusDTO, string> = {
  queued: "border-sky-200 bg-sky-50 text-sky-700",
  running: "border-primary/20 bg-primary/10 text-primary",
  needs_review: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  canceled: "border-stone-200 bg-stone-100 text-stone-600",
};

const CRAWL_CANDIDATE_REVIEW_STATUS_LABELS: Record<
  CrawlCandidateReviewStatusDTO,
  string
> = {
  pending: "待审核",
  accepted: "已通过",
  rejected: "已拒绝",
  merged: "已合并",
};

const CRAWL_CANDIDATE_REVIEW_STATUS_TONES: Record<
  CrawlCandidateReviewStatusDTO,
  string
> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  merged: "border-sky-200 bg-sky-50 text-sky-700",
};

const BATCH_ITEM_STATUS_TONES: Record<WorkspaceTaskStatus, string> = {
  discovered: "bg-stone-100 text-stone-700",
  matched: "bg-sky-50 text-sky-700",
  review_required: "bg-amber-50 text-amber-700",
  approved: "bg-primary/10 text-primary",
  scheduled: "bg-indigo-50 text-indigo-700",
  sent: "bg-emerald-50 text-emerald-700",
  send_failed: "bg-red-50 text-red-700",
  reply_detected: "bg-emerald-100 text-emerald-800",
  canceled: "bg-stone-100 text-stone-500",
};

const CRAWL_REFRESH_INTERVAL_MS = 5000;
const CRAWL_DETAILS_REFRESH_INTERVAL_MS = 5000;
const TASKS_PAGE_SIZE = 8;
const API_TIMEZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;
const SCHEDULE_DATE_PATTERN = /^\d{4}-(\d{2})-(\d{2})$/;

const formatScheduleDate = (value: string) => {
  const match = SCHEDULE_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  return `${Number(match[1])}/${Number(match[2])}`;
};

const buildScheduleLabel = (task: BatchTaskCardDTO) => {
  if (task.schedule_type === "immediate") {
    return "立即执行";
  }
  const dates = (task.scheduled_dates ?? [])
    .filter((date) => SCHEDULE_DATE_PATTERN.test(date))
    .sort();
  if (dates.length > 0) {
    const firstDate = formatScheduleDate(dates[0]);
    const lastDate = formatScheduleDate(dates[dates.length - 1]);
    const dateRange =
      firstDate && lastDate && firstDate !== lastDate
        ? `${firstDate}-${lastDate}`
        : firstDate;
    if (dateRange) {
      return `${dateRange} 共 ${dates.length} 天，${task.window_start_time ?? "--:--"}-${task.window_end_time ?? "--:--"}，每天最多 ${task.emails_per_window ?? 0} 封`;
    }
  }
  return `${task.window_start_time ?? "--:--"} - ${task.window_end_time ?? "--:--"}，窗口内 ${task.emails_per_window ?? 0} 封`;
};

const getTotalPages = (totalCount: number) =>
  Math.max(1, Math.ceil(totalCount / TASKS_PAGE_SIZE));

const getPageItems = <T,>(items: T[], page: number) => {
  const startIndex = (page - 1) * TASKS_PAGE_SIZE;
  return items.slice(startIndex, startIndex + TASKS_PAGE_SIZE);
};

type TaskListPaginationProps = {
  page: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

const TaskListPagination = ({
  page,
  totalCount,
  onPageChange,
}: TaskListPaginationProps) => {
  if (totalCount <= TASKS_PAGE_SIZE) {
    return null;
  }

  const totalPages = getTotalPages(totalCount);
  const startItem = (page - 1) * TASKS_PAGE_SIZE + 1;
  const endItem = Math.min(totalCount, page * TASKS_PAGE_SIZE);

  return (
    <nav
      aria-label="任务分页"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm"
    >
      <div className="text-stone-500">
        显示 {startItem}-{endItem} / {totalCount} 个任务
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="ui-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </button>
        <span className="min-w-20 text-center text-sm font-medium text-stone-700">
          第 {page} / {totalPages} 页
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="ui-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
};

const parseApiDate = (value: string) => {
  const normalizedValue = API_TIMEZONE_SUFFIX_PATTERN.test(value)
    ? value
    : `${value}Z`;
  return new Date(normalizedValue);
};

const formatDisplayTime = (value: string | null | undefined) => {
  if (!value) {
    return "--";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseApiDate(value));
};

export const TasksPage = () => {
  const { selectedIdentityId, selectedLlmProfileId } = useSelectionContext();
  const { notifyError, notifySuccess } = useNotification();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<TasksTab>("batch");
  const [tasks, setTasks] = useState<BatchTaskCardDTO[]>([]);
  const [selectedBatchTask, setSelectedBatchTask] =
    useState<BatchTaskCardDTO | null>(null);
  const [selectedBatchTaskItems, setSelectedBatchTaskItems] = useState<
    BatchTaskItemDTO[]
  >([]);
  const [batchTaskDetailsLoading, setBatchTaskDetailsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [crawlJobs, setCrawlJobs] = useState<CrawlJobSummaryDTO[]>([]);
  const [crawlJobsLoading, setCrawlJobsLoading] = useState(false);
  const [batchPage, setBatchPage] = useState(1);
  const [crawlPage, setCrawlPage] = useState(1);
  const [selectedCrawlJob, setSelectedCrawlJob] =
    useState<CrawlJobSummaryDTO | null>(null);
  const [crawlJobPages, setCrawlJobPages] = useState<CrawlPageDTO[]>([]);
  const [crawlJobCandidates, setCrawlJobCandidates] = useState<
    CrawlCandidateDTO[]
  >([]);
  const [crawlJobEvents, setCrawlJobEvents] = useState<CrawlJobEventDTO[]>([]);
  const [crawlJobDetailsLoading, setCrawlJobDetailsLoading] = useState(false);
  const [selectedCrawlCandidateIds, setSelectedCrawlCandidateIds] = useState<
    number[]
  >([]);
  const [crawlJobApproveLoading, setCrawlJobApproveLoading] = useState(false);
  const [crawlCandidateMutatingIds, setCrawlCandidateMutatingIds] = useState<
    number[]
  >([]);
  const lastLoadErrorRef = useRef<string | null>(null);
  const lastBatchTaskDetailsLoadErrorRef = useRef<string | null>(null);
  const lastCrawlJobsLoadErrorRef = useRef<string | null>(null);
  const lastCrawlJobDetailsLoadErrorRef = useRef<string | null>(null);
  const loadedTasksKeyRef = useRef<string | null>(null);
  const crawlJobsPreloadedRef = useRef(false);
  const activeTasksRequestKeyRef = useRef<string | null>(null);
  const latestTasksRequestIdRef = useRef(0);
  const latestBatchTaskDetailsRequestIdRef = useRef(0);
  const latestCrawlJobsRequestIdRef = useRef(0);
  const latestCrawlJobDetailsRequestIdRef = useRef(0);
  const tasksRequestKey =
    selectedIdentityId && selectedLlmProfileId
      ? `${selectedIdentityId}:${selectedLlmProfileId}`
      : null;
  const batchRunningCount = useMemo(
    () => tasks.filter((task) => task.status === "running").length,
    [tasks],
  );
  const batchAttentionCount = useMemo(
    () =>
      tasks.reduce(
        (total, task) => total + task.review_required_count + task.failed_count,
        0,
      ),
    [tasks],
  );
  const crawlRunningCount = useMemo(
    () =>
      crawlJobs.filter(
        (job) => job.status === "queued" || job.status === "running",
      ).length,
    [crawlJobs],
  );
  const crawlReviewCount = useMemo(
    () => crawlJobs.filter((job) => job.status === "needs_review").length,
    [crawlJobs],
  );
  const totalRunningCount = batchRunningCount + crawlRunningCount;
  const totalAttentionCount = batchAttentionCount + crawlReviewCount;
  const sentBatchTaskItems = useMemo(
    () =>
      selectedBatchTaskItems.filter(
        (item) => item.status === "sent" || item.status === "reply_detected",
      ),
    [selectedBatchTaskItems],
  );
  const pendingBatchTaskItems = useMemo(
    () =>
      selectedBatchTaskItems.filter(
        (item) =>
          item.status !== "sent" &&
          item.status !== "reply_detected" &&
          item.status !== "send_failed" &&
          item.status !== "canceled",
      ),
    [selectedBatchTaskItems],
  );
  const failedBatchTaskItems = useMemo(
    () =>
      selectedBatchTaskItems.filter((item) => item.status === "send_failed"),
    [selectedBatchTaskItems],
  );
  const visibleBatchTasks = useMemo(
    () => getPageItems(tasks, batchPage),
    [batchPage, tasks],
  );
  const visibleCrawlJobs = useMemo(
    () => getPageItems(crawlJobs, crawlPage),
    [crawlJobs, crawlPage],
  );
  const selectedCrawlJobId = selectedCrawlJob?.id ?? null;
  const reviewableCrawlCandidateIds = useMemo(
    () => getReviewableCandidateIds(crawlJobCandidates),
    [crawlJobCandidates],
  );
  const selectedReviewableCrawlCandidateIds = useMemo(
    () =>
      pruneSelectedCandidateIds(selectedCrawlCandidateIds, crawlJobCandidates),
    [crawlJobCandidates, selectedCrawlCandidateIds],
  );
  const allReviewableCrawlCandidatesSelected = useMemo(
    () =>
      reviewableCrawlCandidateIds.length > 0 &&
      reviewableCrawlCandidateIds.every((candidateId) =>
        selectedReviewableCrawlCandidateIds.includes(candidateId),
      ),
    [reviewableCrawlCandidateIds, selectedReviewableCrawlCandidateIds],
  );

  const loadTasks = useCallback(async () => {
    if (!tasksRequestKey || !selectedIdentityId || !selectedLlmProfileId) {
      latestTasksRequestIdRef.current += 1;
      activeTasksRequestKeyRef.current = null;
      loadedTasksKeyRef.current = null;
      setTasks([]);
      lastLoadErrorRef.current = null;
      setLoading(false);
      return;
    }
    const requestId = latestTasksRequestIdRef.current + 1;
    latestTasksRequestIdRef.current = requestId;
    activeTasksRequestKeyRef.current = tasksRequestKey;
    setLoading(true);
    try {
      const data = await listBatchTasks({
        identityId: selectedIdentityId,
        llmProfileId: selectedLlmProfileId,
      });
      if (
        latestTasksRequestIdRef.current !== requestId ||
        activeTasksRequestKeyRef.current !== tasksRequestKey
      ) {
        return;
      }
      setTasks(data);
      loadedTasksKeyRef.current = tasksRequestKey;
      lastLoadErrorRef.current = null;
    } catch (loadError) {
      if (
        latestTasksRequestIdRef.current !== requestId ||
        activeTasksRequestKeyRef.current !== tasksRequestKey
      ) {
        return;
      }
      if (loadedTasksKeyRef.current !== tasksRequestKey) {
        setTasks([]);
      }
      const message =
        loadError instanceof Error ? loadError.message : "加载任务失败";
      if (lastLoadErrorRef.current !== message) {
        notifyError("加载任务失败", message);
        lastLoadErrorRef.current = message;
      }
    } finally {
      if (
        latestTasksRequestIdRef.current === requestId &&
        activeTasksRequestKeyRef.current === tasksRequestKey
      ) {
        setLoading(false);
      }
    }
  }, [notifyError, selectedIdentityId, selectedLlmProfileId, tasksRequestKey]);

  const loadCrawlJobs = useCallback(async (options?: { showLoading?: boolean }) => {
    const requestId = latestCrawlJobsRequestIdRef.current + 1;
    latestCrawlJobsRequestIdRef.current = requestId;
    if (options?.showLoading ?? true) {
      setCrawlJobsLoading(true);
    }
    try {
      const data = await listCrawlJobs();
      if (latestCrawlJobsRequestIdRef.current !== requestId) {
        return;
      }
      setCrawlJobs(data);
      setSelectedCrawlJob((currentJob) => {
        if (!currentJob) {
          return currentJob;
        }
        return data.find((job) => job.id === currentJob.id) ?? currentJob;
      });
      lastCrawlJobsLoadErrorRef.current = null;
    } catch (loadError) {
      if (latestCrawlJobsRequestIdRef.current !== requestId) {
        return;
      }
      const message =
        loadError instanceof Error ? loadError.message : "加载抓取任务失败";
      if (lastCrawlJobsLoadErrorRef.current !== message) {
        notifyError("加载抓取任务失败", message);
        lastCrawlJobsLoadErrorRef.current = message;
      }
    } finally {
      if (
        latestCrawlJobsRequestIdRef.current === requestId &&
        (options?.showLoading ?? true)
      ) {
        setCrawlJobsLoading(false);
      }
    }
  }, [notifyError]);

  const loadBatchTaskDetails = useCallback(
    async (taskId: number) => {
      const requestId = latestBatchTaskDetailsRequestIdRef.current + 1;
      latestBatchTaskDetailsRequestIdRef.current = requestId;
      setBatchTaskDetailsLoading(true);
      try {
        const data = await listBatchTaskItems(taskId);
        if (latestBatchTaskDetailsRequestIdRef.current !== requestId) {
          return;
        }
        setSelectedBatchTaskItems(data);
        lastBatchTaskDetailsLoadErrorRef.current = null;
      } catch (loadError) {
        if (latestBatchTaskDetailsRequestIdRef.current !== requestId) {
          return;
        }
        const message =
          loadError instanceof Error
            ? loadError.message
            : "加载批量任务详情失败";
        if (lastBatchTaskDetailsLoadErrorRef.current !== message) {
          notifyError("加载批量任务详情失败", message);
          lastBatchTaskDetailsLoadErrorRef.current = message;
        }
      } finally {
        if (latestBatchTaskDetailsRequestIdRef.current === requestId) {
          setBatchTaskDetailsLoading(false);
        }
      }
    },
    [notifyError],
  );

  const loadCrawlJobDetails = useCallback(
    async (jobId: number, options?: { showLoading?: boolean }) => {
      const requestId = latestCrawlJobDetailsRequestIdRef.current + 1;
      latestCrawlJobDetailsRequestIdRef.current = requestId;
      if (options?.showLoading ?? true) {
        setCrawlJobDetailsLoading(true);
      }
      try {
        const [pages, candidates, events] = await Promise.all([
          listCrawlPages(jobId),
          listCrawlCandidates(jobId),
          getCrawlJobEvents(jobId),
        ]);
        if (latestCrawlJobDetailsRequestIdRef.current !== requestId) {
          return;
        }
        setCrawlJobPages(pages);
        setCrawlJobCandidates(candidates);
        setCrawlJobEvents(events);
        lastCrawlJobDetailsLoadErrorRef.current = null;
      } catch (loadError) {
        if (latestCrawlJobDetailsRequestIdRef.current !== requestId) {
          return;
        }
        const message =
          loadError instanceof Error
            ? loadError.message
            : "加载抓取任务日志失败";
        if (lastCrawlJobDetailsLoadErrorRef.current !== message) {
          notifyError("加载抓取任务日志失败", message);
          lastCrawlJobDetailsLoadErrorRef.current = message;
        }
      } finally {
        if (
          latestCrawlJobDetailsRequestIdRef.current === requestId &&
          (options?.showLoading ?? true)
        ) {
          setCrawlJobDetailsLoading(false);
        }
      }
    },
    [notifyError],
  );

  useEffect(() => {
    if (activeTab !== "batch") {
      return undefined;
    }
    void loadTasks();
    const timer = window.setInterval(() => {
      void loadTasks();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadTasks]);

  useEffect(() => {
    setBatchPage((currentPage) =>
      Math.min(currentPage, getTotalPages(tasks.length)),
    );
  }, [tasks.length]);

  useEffect(() => {
    setCrawlPage((currentPage) =>
      Math.min(currentPage, getTotalPages(crawlJobs.length)),
    );
  }, [crawlJobs.length]);

  useEffect(() => {
    if (crawlJobsPreloadedRef.current) {
      return;
    }
    crawlJobsPreloadedRef.current = true;
    void loadCrawlJobs({ showLoading: false });
  }, [loadCrawlJobs]);

  useEffect(() => {
    if (activeTab !== "crawl") {
      return undefined;
    }
    void loadCrawlJobs({ showLoading: crawlJobs.length === 0 });
    const timer = window.setInterval(() => {
      void loadCrawlJobs({ showLoading: false });
    }, CRAWL_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeTab, crawlJobs.length, loadCrawlJobs]);

  useEffect(() => {
    if (!selectedBatchTask) {
      return undefined;
    }
    lastBatchTaskDetailsLoadErrorRef.current = null;
    void loadBatchTaskDetails(selectedBatchTask.id);
    const timer = window.setInterval(() => {
      void loadBatchTaskDetails(selectedBatchTask.id);
    }, 5000);
    return () => {
      latestBatchTaskDetailsRequestIdRef.current += 1;
      window.clearInterval(timer);
    };
  }, [loadBatchTaskDetails, selectedBatchTask]);

  useEffect(() => {
    if (!selectedCrawlJobId) {
      return undefined;
    }
    lastCrawlJobDetailsLoadErrorRef.current = null;
    void loadCrawlJobDetails(selectedCrawlJobId, { showLoading: true });
    const timer = window.setInterval(() => {
      void loadCrawlJobDetails(selectedCrawlJobId, { showLoading: false });
    }, CRAWL_DETAILS_REFRESH_INTERVAL_MS);
    return () => {
      latestCrawlJobDetailsRequestIdRef.current += 1;
      window.clearInterval(timer);
    };
  }, [loadCrawlJobDetails, selectedCrawlJobId]);

  useEffect(() => {
    setSelectedCrawlCandidateIds((currentIds) =>
      pruneSelectedCandidateIds(currentIds, crawlJobCandidates),
    );
  }, [crawlJobCandidates]);

  useEffect(() => {
    setSelectedCrawlCandidateIds([]);
    setCrawlJobApproveLoading(false);
    setCrawlCandidateMutatingIds([]);
  }, [selectedCrawlJobId]);

  const handleAction = async (
    taskId: number,
    action: "pause" | "resume" | "stop",
  ) => {
    const diagnosticData = { taskId, action };
    try {
      if (action === "pause") {
        safeRecordUserAction({
          eventName: "tasks.batch_task_pause_submitted",
          data: diagnosticData,
        });
        await pauseBatchTask(taskId);
      } else if (action === "resume") {
        safeRecordUserAction({
          eventName: "tasks.batch_task_resume_submitted",
          data: diagnosticData,
        });
        await resumeBatchTask(taskId);
      } else {
        const confirmed = await confirm({
          title: "确认中止这个任务？",
          description: "中止后当前批次不会继续推进生成、排程和发送。",
          confirmLabel: "确认中止",
          cancelLabel: "先保留",
          tone: "danger",
        });
        if (!confirmed) {
          return;
        }
        safeRecordUserAction({
          eventName: "tasks.batch_task_stop_submitted",
          data: diagnosticData,
        });
        await stopBatchTask(taskId);
      }
      safeRecordUserAction({
        eventName: `tasks.batch_task_${action}_succeeded`,
        data: diagnosticData,
      });
      await loadTasks();
    } catch (actionError) {
      safeRecordUserAction({
        eventName: `tasks.batch_task_${action}_failed`,
        data: diagnosticData,
        level: "error",
      });
      const message =
        actionError instanceof Error ? actionError.message : "任务操作失败";
      notifyError("任务操作失败", message);
    }
  };

  const handleCancelCrawlJob = async (jobId: number) => {
    const confirmed = await confirm({
      title: "确认取消这个抓取任务？",
      description: "取消后当前抓取任务会停止继续抓取页面和候选导师。",
      confirmLabel: "确认取消",
      cancelLabel: "先保留",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    const diagnosticData = { jobId };
    safeRecordUserAction({
      eventName: "tasks.crawl_job_cancel_submitted",
      data: diagnosticData,
    });
    try {
      await cancelCrawlJob(jobId);
      safeRecordUserAction({
        eventName: "tasks.crawl_job_cancel_succeeded",
        data: diagnosticData,
      });
      await loadCrawlJobs();
    } catch (actionError) {
      safeRecordUserAction({
        eventName: "tasks.crawl_job_cancel_failed",
        data: diagnosticData,
        level: "error",
      });
      const message =
        actionError instanceof Error ? actionError.message : "抓取任务操作失败";
      notifyError("抓取任务操作失败", message);
    }
  };

  const handleToggleCrawlCandidateSelection = (candidateId: number) => {
    if (!reviewableCrawlCandidateIds.includes(candidateId)) {
      return;
    }

    setSelectedCrawlCandidateIds((currentIds) =>
      currentIds.includes(candidateId)
        ? currentIds.filter((id) => id !== candidateId)
        : [...currentIds, candidateId],
    );
  };

  const handleUpdateCrawlCandidateReviewStatus = async (
    candidate: CrawlCandidateDTO,
    reviewStatus: CrawlCandidateReviewStatusDTO,
  ) => {
    setCrawlCandidateMutatingIds((currentIds) =>
      currentIds.includes(candidate.id)
        ? currentIds
        : [...currentIds, candidate.id],
    );
    try {
      const updatedCandidate = await updateCrawlCandidate(
        candidate.id,
        buildCandidateReviewPayload(candidate, reviewStatus),
      );
      setCrawlJobCandidates((currentCandidates) =>
        currentCandidates.map((item) =>
          item.id === updatedCandidate.id ? updatedCandidate : item,
        ),
      );
      notifySuccess(
        reviewStatus === "rejected" ? "已拒绝候选导师" : "已恢复待审核",
        `已更新“${candidate.name}”的审核状态。`,
      );
    } catch (actionError) {
      const message =
        actionError instanceof Error
          ? actionError.message
          : "更新候选导师审核状态失败";
      notifyError("更新候选导师审核状态失败", message);
    } finally {
      setCrawlCandidateMutatingIds((currentIds) =>
        currentIds.filter((id) => id !== candidate.id),
      );
    }
  };

  const handleApproveSelectedCrawlCandidates = async () => {
    if (!selectedCrawlJobId || selectedReviewableCrawlCandidateIds.length === 0) {
      return;
    }

    const confirmed = await confirm({
      title: `确认通过并导入这 ${selectedReviewableCrawlCandidateIds.length} 位候选导师吗？`,
      description:
        "通过后，这些候选导师会写入导师库，当前抓取任务会标记为已完成。",
      confirmLabel: "确认导入",
      cancelLabel: "先保留",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    setCrawlJobApproveLoading(true);
    try {
      const result = await approveCrawlCandidates(
        selectedCrawlJobId,
        selectedReviewableCrawlCandidateIds,
      );
      setSelectedCrawlCandidateIds([]);
      notifySuccess("审核完成", result.message);
      await loadCrawlJobs({ showLoading: false });
      await loadCrawlJobDetails(selectedCrawlJobId, { showLoading: false });
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "审核导入候选导师失败";
      notifyError("审核导入候选导师失败", message);
    } finally {
      setCrawlJobApproveLoading(false);
    }
  };

  const closeCrawlJobDetails = () => {
    latestCrawlJobDetailsRequestIdRef.current += 1;
    setSelectedCrawlJob(null);
    setCrawlJobPages([]);
    setCrawlJobCandidates([]);
    setCrawlJobEvents([]);
    setSelectedCrawlCandidateIds([]);
    setCrawlJobApproveLoading(false);
    setCrawlCandidateMutatingIds([]);
    setCrawlJobDetailsLoading(false);
    lastCrawlJobDetailsLoadErrorRef.current = null;
  };

  const closeBatchTaskDetails = () => {
    latestBatchTaskDetailsRequestIdRef.current += 1;
    setSelectedBatchTask(null);
    setSelectedBatchTaskItems([]);
    setBatchTaskDetailsLoading(false);
    lastBatchTaskDetailsLoadErrorRef.current = null;
  };

  if (!selectedIdentityId || !selectedLlmProfileId) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-3xl border border-dashed border-stone-300 bg-[#fcfbf8] p-10 text-center">
          <h1 className="text-2xl font-semibold text-stone-900">
            选择身份和模型
          </h1>
          <p className="mt-3 text-sm text-stone-600">
            任务中心使用顶部选择的身份和模型。
          </p>
        </div>
        {confirmDialog}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="rounded-3xl border border-stone-200 bg-[#fcfbf8] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-stone-900">任务中心</h1>
            <p className="mt-2 text-sm text-stone-600">
              集中查看批量邮件和教师抓取任务的进度、异常与待处理项。
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Mail className="h-4 w-4 text-primary" />
              批量邮件
            </div>
            <div className="mt-2 text-2xl font-semibold text-stone-900">
              {tasks.length}
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <FileSearch className="h-4 w-4 text-sky-600" />
              教师抓取
            </div>
            <div className="mt-2 text-2xl font-semibold text-stone-900">
              {crawlJobs.length}
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Activity className="h-4 w-4 text-emerald-600" />
              运行中
            </div>
            <div className="mt-2 text-2xl font-semibold text-stone-900">
              {totalRunningCount}
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Clock3 className="h-4 w-4 text-amber-600" />
              待处理
            </div>
            <div className="mt-2 text-2xl font-semibold text-stone-900">
              {totalAttentionCount}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 inline-flex gap-2 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm">
        <button
          type="button"
          aria-label="批量邮件"
          onClick={() => setActiveTab("batch")}
          className={
            activeTab === "batch"
              ? "inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-white"
              : "inline-flex min-h-10 items-center gap-2 rounded-xl px-5 text-sm font-medium text-stone-600 hover:bg-stone-50"
          }
        >
          <Mail className="h-4 w-4" />
          批量邮件
          <span
            className={
              activeTab === "batch" ? "text-white/80" : "text-stone-400"
            }
          >
            {tasks.length}
          </span>
        </button>
        <button
          type="button"
          aria-label="教师抓取"
          onClick={() => setActiveTab("crawl")}
          className={
            activeTab === "crawl"
              ? "inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-white"
              : "inline-flex min-h-10 items-center gap-2 rounded-xl px-5 text-sm font-medium text-stone-600 hover:bg-stone-50"
          }
        >
          <FileSearch className="h-4 w-4" />
          教师抓取
          <span
            className={
              activeTab === "crawl" ? "text-white/80" : "text-stone-400"
            }
          >
            {crawlJobs.length}
          </span>
        </button>
      </div>

      {activeTab === "batch" && loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-3xl border border-stone-200 bg-white px-6 py-14 text-sm text-stone-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载任务列表...
        </div>
      ) : activeTab === "batch" && tasks.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center text-sm text-stone-500 shadow-sm">
          暂无任务。可从首页创建。
        </div>
      ) : activeTab === "batch" ? (
        <>
          <div className="mt-6 grid gap-4">
            {visibleBatchTasks.map((task) => {
            const progress =
              task.target_count === 0
                ? 0
                : Math.round((task.completed_count / task.target_count) * 100);

            return (
              <article
                key={task.id}
                className="rounded-2xl border border-stone-200 bg-white px-5 py-5 shadow-sm"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px_minmax(260px,auto)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
                      <Mail className="h-4 w-4 text-primary" />
                      批量邮件任务
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="mt-2 truncate text-base font-semibold text-stone-900">
                        {task.name}
                      </h2>
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                        {BATCH_TASK_STATUS_LABELS[task.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-stone-500">
                      {buildScheduleLabel(task)}
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs text-stone-500">
                      <span>
                        {task.completed_count}/{task.target_count}
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <span className="rounded-full bg-stone-50 px-2.5 py-1 text-xs text-stone-600">
                      待生成 {task.pending_generation_count}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                      待审核 {task.review_required_count}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                      已发送 {task.sent_count + task.replied_count}
                    </span>
                    {task.failed_count > 0 ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-700">
                        失败 {task.failed_count}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {task.status === "running" ? (
                      <button
                        type="button"
                        onClick={() => void handleAction(task.id, "pause")}
                        className="ui-btn-secondary"
                      >
                        <Pause className="h-4 w-4" />
                        暂停
                      </button>
                    ) : null}
                    {task.status === "paused" ? (
                      <button
                        type="button"
                        onClick={() => void handleAction(task.id, "resume")}
                        className="ui-btn-secondary"
                      >
                        <Play className="h-4 w-4" />
                        继续
                      </button>
                    ) : null}
                    {task.status !== "stopped" &&
                    task.status !== "completed" ? (
                      <button
                        type="button"
                        onClick={() => void handleAction(task.id, "stop")}
                        className="ui-btn-danger"
                      >
                        <Square className="h-4 w-4" />
                        中止
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedBatchTask(task)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                      aria-label="查看详情"
                      title="查看详情"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
            })}
          </div>
          <TaskListPagination
            page={batchPage}
            totalCount={tasks.length}
            onPageChange={setBatchPage}
          />
        </>
      ) : crawlJobsLoading && crawlJobs.length === 0 ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-3xl border border-stone-200 bg-white px-6 py-14 text-sm text-stone-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载抓取任务列表...
        </div>
      ) : crawlJobs.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center text-sm text-stone-500 shadow-sm">
          暂无抓取任务。可从导师管理页创建。
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4">
            {visibleCrawlJobs.map((job) => (
            <article
              key={job.id}
              className="rounded-2xl border border-stone-200 bg-white px-5 py-5 shadow-sm"
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px_minmax(260px,auto)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
                      <Bot className="h-4 w-4 text-primary" />
                      智能抓取任务
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${CRAWL_JOB_STATUS_TONES[job.status]}`}
                    >
                      {CRAWL_JOB_STATUS_LABELS[job.status]}
                    </span>
                  </div>
                  <h2 className="mt-2 truncate text-base font-semibold text-stone-900">
                      {job.university} / {job.school}
                    </h2>
                  <p className="mt-1 truncate text-sm text-stone-500">
                    {job.start_url}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-stone-100 bg-stone-50/60 px-4 py-3">
                    <div className="text-xs font-medium text-stone-500">
                      页面
                    </div>
                    <div className="mt-2 text-sm font-semibold text-stone-900">
                      已抓页面 {job.page_count}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-stone-100 bg-stone-50/60 px-4 py-3">
                    <div className="text-xs font-medium text-stone-500">
                      候选
                    </div>
                    <div className="mt-2 text-sm font-semibold text-stone-900">
                      候选导师 {job.candidate_count}
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="text-xs font-medium text-stone-500">
                    更新 {formatDisplayTime(job.updated_at)}
                  </div>
                  {job.latest_event_message ? (
                    <div className="mt-2 flex items-start gap-2 rounded-2xl border border-primary/10 bg-primary/5 px-3 py-2 text-sm text-stone-700">
                      <Activity className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <p className="line-clamp-2">{job.latest_event_message}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-stone-500">暂无最新事件</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      safeRecordUserAction({
                        eventName: "tasks.crawl_job_detail_opened",
                        data: { jobId: job.id, status: job.status },
                      });
                      setSelectedCrawlJob(job);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                    aria-label="查看详情"
                    title="查看详情"
                  >
                    <FileSearch className="h-4 w-4" />
                  </button>
                  {job.status === "queued" || job.status === "running" ? (
                    <button
                      type="button"
                      onClick={() => void handleCancelCrawlJob(job.id)}
                      className="ui-btn-danger"
                    >
                      <Square className="h-4 w-4" />
                      取消抓取
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
            ))}
          </div>
          <TaskListPagination
            page={crawlPage}
            totalCount={crawlJobs.length}
            onPageChange={setCrawlPage}
          />
        </>
      )}
      {selectedBatchTask ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-stone-950/30 p-0 sm:p-6"
          onClick={closeBatchTaskDetails}
        >
          <section
            role="dialog"
            aria-label="批量任务详情"
            className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:max-w-4xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 bg-[#fcfbf8] px-6 py-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
                  <Mail className="h-4 w-4 text-primary" />
                  批量邮件任务
                </div>
                <h2 className="mt-2 text-xl font-semibold text-stone-900">
                  {selectedBatchTask.name}
                </h2>
                <p className="mt-2 text-sm text-stone-500">
                  {buildScheduleLabel(selectedBatchTask)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeBatchTaskDetails}
                className="ui-btn-secondary shrink-0"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
                关闭
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-stone-100 bg-white px-4 py-3">
                  <div className="text-xs font-medium text-stone-500">
                    当前状态
                  </div>
                  <div className="mt-2 text-sm font-semibold text-stone-900">
                    {BATCH_TASK_STATUS_LABELS[selectedBatchTask.status]}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-100 bg-white px-4 py-3">
                  <div className="text-xs font-medium text-stone-500">
                    目标人数
                  </div>
                  <div className="mt-2 text-sm font-semibold text-stone-900">
                    {selectedBatchTask.target_count}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-100 bg-white px-4 py-3">
                  <div className="text-xs font-medium text-stone-500">
                    已完成
                  </div>
                  <div className="mt-2 text-sm font-semibold text-stone-900">
                    {selectedBatchTask.completed_count}
                  </div>
                </div>
              </div>

              <section className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-stone-900">
                    导师进度
                  </h3>
                  {batchTaskDetailsLoading ? (
                    <span className="inline-flex items-center gap-2 text-xs text-stone-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      正在刷新
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <div className="text-xs font-medium text-emerald-700">
                      已发送/已回复
                    </div>
                    <div className="mt-2 text-xl font-semibold text-emerald-900">
                      {sentBatchTaskItems.length}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                    <div className="text-xs font-medium text-amber-700">
                      还未发送
                    </div>
                    <div className="mt-2 text-xl font-semibold text-amber-900">
                      {pendingBatchTaskItems.length}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                    <div className="text-xs font-medium text-red-700">
                      发送失败
                    </div>
                    <div className="mt-2 text-xl font-semibold text-red-900">
                      {failedBatchTaskItems.length}
                    </div>
                  </div>
                </div>
              </section>

              <section className="mt-6">
                <h3 className="text-sm font-semibold text-stone-900">
                  已发送给
                </h3>
                <div className="mt-3 space-y-2">
                  {sentBatchTaskItems.length > 0 ? (
                    sentBatchTaskItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-stone-100 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-stone-900">
                              {item.professor_name}
                            </p>
                            <p className="mt-1 text-xs text-stone-500">
                              {[
                                item.professor_title,
                                item.professor_school,
                                item.professor_email,
                              ]
                                .filter(Boolean)
                                .join(" / ") || "暂无补充信息"}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs ${BATCH_ITEM_STATUS_TONES[item.status]}`}
                          >
                            {PROFESSOR_STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                          <span>
                            发送时间 {formatDisplayTime(item.sent_at)}
                          </span>
                          <Link
                            to={`/workspace/${item.professor_id}`}
                            className="font-medium text-primary"
                          >
                            查看通信
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
                      暂无已发送导师。
                    </p>
                  )}
                </div>
              </section>

              <section className="mt-6">
                <h3 className="text-sm font-semibold text-stone-900">
                  还未发送给
                </h3>
                <div className="mt-3 space-y-2">
                  {pendingBatchTaskItems.length > 0 ? (
                    pendingBatchTaskItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-stone-100 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-stone-900">
                              {item.professor_name}
                            </p>
                            <p className="mt-1 text-xs text-stone-500">
                              {[
                                item.professor_title,
                                item.professor_school,
                                item.professor_email,
                              ]
                                .filter(Boolean)
                                .join(" / ") || "暂无补充信息"}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs ${BATCH_ITEM_STATUS_TONES[item.status]}`}
                          >
                            {PROFESSOR_STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                          {item.scheduled_at ? (
                            <span>
                              计划发送 {formatDisplayTime(item.scheduled_at)}
                            </span>
                          ) : null}
                          {item.match_score !== null ? (
                            <span>匹配分 {item.match_score}</span>
                          ) : null}
                          <Link
                            to={`/workspace/${item.professor_id}`}
                            className="font-medium text-primary"
                          >
                            去处理
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
                      暂无未发送导师。
                    </p>
                  )}
                </div>
              </section>

              {failedBatchTaskItems.length > 0 ? (
                <section className="mt-6">
                  <h3 className="text-sm font-semibold text-stone-900">
                    发送失败
                  </h3>
                  <div className="mt-3 space-y-2">
                    {failedBatchTaskItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-stone-900">
                              {item.professor_name}
                            </p>
                            <p className="mt-1 text-xs text-red-700">
                              {item.last_error || "暂无失败原因"}
                            </p>
                          </div>
                          <Link
                            to={`/workspace/${item.professor_id}`}
                            className="text-xs font-medium text-primary"
                          >
                            查看并处理
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="mt-6">
                <h3 className="text-sm font-semibold text-stone-900">
                  基础信息
                </h3>
                <dl className="mt-3 divide-y divide-stone-100 rounded-2xl border border-stone-100 text-sm">
                  <div className="grid gap-1 px-4 py-3 sm:grid-cols-[120px_1fr]">
                    <dt className="text-stone-500">邮件主题</dt>
                    <dd className="text-stone-800">
                      {selectedBatchTask.email_subject || "未设置"}
                    </dd>
                  </div>
                  <div className="grid gap-1 px-4 py-3 sm:grid-cols-[120px_1fr]">
                    <dt className="text-stone-500">创建时间</dt>
                    <dd className="text-stone-800">
                      {formatDisplayTime(selectedBatchTask.created_at)}
                    </dd>
                  </div>
                  <div className="grid gap-1 px-4 py-3 sm:grid-cols-[120px_1fr]">
                    <dt className="text-stone-500">更新时间</dt>
                    <dd className="text-stone-800">
                      {formatDisplayTime(selectedBatchTask.updated_at)}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </section>
        </div>
      ) : null}
      {selectedCrawlJob ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-stone-950/30 p-0 sm:p-6"
          onClick={closeCrawlJobDetails}
        >
          <section
            role="dialog"
            aria-label="抓取任务详情"
            className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:max-w-3xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 bg-[#fcfbf8] px-6 py-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
                  <Activity className="h-4 w-4 text-primary" />
                  实时抓取监控
                </div>
                <h2 className="text-xl font-semibold text-stone-900">
                  {selectedCrawlJob.university} / {selectedCrawlJob.school}
                </h2>
                <p className="mt-2 break-all text-sm text-stone-500">
                  {selectedCrawlJob.start_url}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCrawlJobDetails}
                className="ui-btn-secondary shrink-0"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
                关闭
              </button>
            </div>

            <div className="border-b border-stone-100 px-6 py-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-stone-100 bg-white px-4 py-3">
                  <div className="text-xs font-medium text-stone-500">
                    当前状态
                  </div>
                  <div className="mt-2 text-sm font-semibold text-stone-900">
                    {CRAWL_JOB_STATUS_LABELS[selectedCrawlJob.status]}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-100 bg-white px-4 py-3">
                  <div className="text-xs font-medium text-stone-500">
                    已抓页面
                  </div>
                  <div className="mt-2 text-sm font-semibold text-stone-900">
                    {selectedCrawlJob.page_count}
                  </div>
                </div>
                <div className="rounded-2xl border border-stone-100 bg-white px-4 py-3">
                  <div className="text-xs font-medium text-stone-500">
                    候选导师
                  </div>
                  <div className="mt-2 text-sm font-semibold text-stone-900">
                    {selectedCrawlJob.candidate_count}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {selectedCrawlJob.error_message ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {selectedCrawlJob.error_message}
                </div>
              ) : null}

              {crawlJobDetailsLoading ? (
                <div className="flex items-center gap-2 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在加载日志详情...
                </div>
              ) : null}

              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <Activity className="h-4 w-4 text-primary" />
                  执行日志
                </h3>
                <div className="mt-3 space-y-3">
                  {crawlJobEvents.length > 0 ? (
                    crawlJobEvents.map((event) => (
                      <div key={event.id} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0 flex-1 rounded-2xl border border-stone-100 px-4 py-3">
                          <p className="text-sm text-stone-800">
                            {event.message}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            {formatDisplayTime(event.created_at)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
                      暂无执行日志。
                    </p>
                  )}
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                    <FileSearch className="h-4 w-4 text-sky-600" />
                    已抓页面
                  </h3>
                  <div className="mt-3 space-y-2">
                    {crawlJobPages.length > 0 ? (
                      crawlJobPages.map((page) => (
                        <div
                          key={page.id}
                          className="rounded-2xl border border-stone-100 px-4 py-3"
                        >
                          <p className="text-sm font-medium text-stone-800">
                            {page.title ?? page.url}
                          </p>
                          <p className="mt-1 break-all text-xs text-stone-500">
                            {page.url}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
                        暂无已抓页面。
                      </p>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    候选导师
                  </h3>
                  <div className="mt-3 space-y-2">
                    {selectedCrawlJob.status === "needs_review" ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-sm text-amber-900">
                            可导入 {reviewableCrawlCandidateIds.length} 位，已选{" "}
                            {selectedReviewableCrawlCandidateIds.length} 位
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedCrawlCandidateIds(
                                  reviewableCrawlCandidateIds,
                                )
                              }
                              disabled={
                                reviewableCrawlCandidateIds.length === 0 ||
                                allReviewableCrawlCandidatesSelected ||
                                crawlJobApproveLoading
                              }
                              className="ui-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              全选可导入
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedCrawlCandidateIds([])}
                              disabled={
                                selectedReviewableCrawlCandidateIds.length ===
                                  0 || crawlJobApproveLoading
                              }
                              className="ui-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              清空选择
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleApproveSelectedCrawlCandidates()
                              }
                              disabled={
                                selectedReviewableCrawlCandidateIds.length ===
                                  0 || crawlJobApproveLoading
                              }
                              className="ui-btn-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {crawlJobApproveLoading ? "导入中..." : "审核通过并导入"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {crawlJobCandidates.length > 0 ? (
                      crawlJobCandidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          className="rounded-2xl border border-stone-100 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                              {selectedCrawlJob.status === "needs_review" ? (
                                <input
                                  type="checkbox"
                                  checked={selectedReviewableCrawlCandidateIds.includes(
                                    candidate.id,
                                  )}
                                  disabled={
                                    candidate.review_status === "rejected" ||
                                    crawlJobApproveLoading ||
                                    crawlCandidateMutatingIds.includes(
                                      candidate.id,
                                    )
                                  }
                                  onChange={() =>
                                    handleToggleCrawlCandidateSelection(
                                      candidate.id,
                                    )
                                  }
                                  aria-label={`选择候选导师 ${candidate.name}`}
                                  className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
                                />
                              ) : null}
                              <p className="text-sm font-medium text-stone-800">
                                {candidate.name}
                              </p>
                            </div>
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                              置信度 {Math.round(candidate.confidence * 100)}%
                            </span>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs ${
                                CRAWL_CANDIDATE_REVIEW_STATUS_TONES[
                                  candidate.review_status
                                ]
                              }`}
                            >
                              {
                                CRAWL_CANDIDATE_REVIEW_STATUS_LABELS[
                                  candidate.review_status
                                ]
                              }
                            </span>
                          </div>
                          {selectedCrawlJob.status === "needs_review" ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {candidate.review_status === "rejected" ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateCrawlCandidateReviewStatus(
                                      candidate,
                                      "pending",
                                    )
                                  }
                                  disabled={
                                    crawlJobApproveLoading ||
                                    crawlCandidateMutatingIds.includes(
                                      candidate.id,
                                    )
                                  }
                                  className="ui-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  恢复待审核
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateCrawlCandidateReviewStatus(
                                      candidate,
                                      "rejected",
                                    )
                                  }
                                  disabled={
                                    crawlJobApproveLoading ||
                                    crawlCandidateMutatingIds.includes(
                                      candidate.id,
                                    )
                                  }
                                  className="ui-btn-danger px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  拒绝
                                </button>
                              )}
                            </div>
                          ) : null}
                          <p className="mt-1 text-sm text-stone-500">
                            {candidate.email ?? "暂无邮箱"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
                        暂无候选导师。
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {confirmDialog}
    </main>
  );
};
