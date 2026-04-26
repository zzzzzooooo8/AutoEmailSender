import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pause, Play, Square, X } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useSelectionContext } from "@/context/SelectionContext";
import { useConfirmDialog } from "@/lib/useConfirmDialog";
import {
  listBatchTasks,
  pauseBatchTask,
  resumeBatchTask,
  stopBatchTask,
} from "@/lib/api/batchTasksApi";
import {
  cancelCrawlJob,
  getCrawlJobEvents,
  listCrawlCandidates,
  listCrawlJobs,
  listCrawlPages,
} from "@/lib/api/crawlJobsApi";
import {
  BATCH_TASK_STATUS_LABELS,
  type BatchTaskCardDTO,
  type CrawlCandidateDTO,
  type CrawlJobEventDTO,
  type CrawlJobStatusDTO,
  type CrawlJobSummaryDTO,
  type CrawlPageDTO,
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

const buildScheduleLabel = (task: BatchTaskCardDTO) => {
  if (task.schedule_type === "immediate") {
    return "立即执行";
  }
  return `${task.window_start_time ?? "--:--"} - ${task.window_end_time ?? "--:--"}，窗口内 ${task.emails_per_window ?? 0} 封`;
};

export const TasksPage = () => {
  const { selectedIdentityId, selectedLlmProfileId } = useSelectionContext();
  const { notifyError } = useNotification();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<TasksTab>("batch");
  const [tasks, setTasks] = useState<BatchTaskCardDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [crawlJobs, setCrawlJobs] = useState<CrawlJobSummaryDTO[]>([]);
  const [crawlJobsLoading, setCrawlJobsLoading] = useState(false);
  const [selectedCrawlJob, setSelectedCrawlJob] = useState<CrawlJobSummaryDTO | null>(null);
  const [crawlJobPages, setCrawlJobPages] = useState<CrawlPageDTO[]>([]);
  const [crawlJobCandidates, setCrawlJobCandidates] = useState<CrawlCandidateDTO[]>([]);
  const [crawlJobEvents, setCrawlJobEvents] = useState<CrawlJobEventDTO[]>([]);
  const [crawlJobDetailsLoading, setCrawlJobDetailsLoading] = useState(false);
  const lastLoadErrorRef = useRef<string | null>(null);
  const lastCrawlJobsLoadErrorRef = useRef<string | null>(null);
  const lastCrawlJobDetailsLoadErrorRef = useRef<string | null>(null);
  const loadedTasksKeyRef = useRef<string | null>(null);
  const activeTasksRequestKeyRef = useRef<string | null>(null);
  const latestTasksRequestIdRef = useRef(0);
  const latestCrawlJobsRequestIdRef = useRef(0);
  const latestCrawlJobDetailsRequestIdRef = useRef(0);
  const tasksRequestKey =
    selectedIdentityId && selectedLlmProfileId
      ? `${selectedIdentityId}:${selectedLlmProfileId}`
      : null;

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
      const message = loadError instanceof Error ? loadError.message : "加载任务失败";
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

  const loadCrawlJobs = useCallback(async () => {
    const requestId = latestCrawlJobsRequestIdRef.current + 1;
    latestCrawlJobsRequestIdRef.current = requestId;
    setCrawlJobsLoading(true);
    try {
      const data = await listCrawlJobs();
      if (latestCrawlJobsRequestIdRef.current !== requestId) {
        return;
      }
      setCrawlJobs(data);
      lastCrawlJobsLoadErrorRef.current = null;
    } catch (loadError) {
      if (latestCrawlJobsRequestIdRef.current !== requestId) {
        return;
      }
      const message = loadError instanceof Error ? loadError.message : "加载抓取任务失败";
      if (lastCrawlJobsLoadErrorRef.current !== message) {
        notifyError("加载抓取任务失败", message);
        lastCrawlJobsLoadErrorRef.current = message;
      }
    } finally {
      if (latestCrawlJobsRequestIdRef.current === requestId) {
        setCrawlJobsLoading(false);
      }
    }
  }, [notifyError]);

  const loadCrawlJobDetails = useCallback(
    async (jobId: number) => {
      const requestId = latestCrawlJobDetailsRequestIdRef.current + 1;
      latestCrawlJobDetailsRequestIdRef.current = requestId;
      setCrawlJobDetailsLoading(true);
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
        const message = loadError instanceof Error ? loadError.message : "加载抓取任务日志失败";
        if (lastCrawlJobDetailsLoadErrorRef.current !== message) {
          notifyError("加载抓取任务日志失败", message);
          lastCrawlJobDetailsLoadErrorRef.current = message;
        }
      } finally {
        if (latestCrawlJobDetailsRequestIdRef.current === requestId) {
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
    if (activeTab !== "crawl") {
      return undefined;
    }
    void loadCrawlJobs();
    const timer = window.setInterval(() => {
      void loadCrawlJobs();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadCrawlJobs]);

  useEffect(() => {
    if (!selectedCrawlJob) {
      return undefined;
    }
    lastCrawlJobDetailsLoadErrorRef.current = null;
    void loadCrawlJobDetails(selectedCrawlJob.id);
    const timer = window.setInterval(() => {
      void loadCrawlJobDetails(selectedCrawlJob.id);
    }, 2000);
    return () => {
      latestCrawlJobDetailsRequestIdRef.current += 1;
      window.clearInterval(timer);
    };
  }, [loadCrawlJobDetails, selectedCrawlJob]);

  const handleAction = async (
    taskId: number,
    action: "pause" | "resume" | "stop",
  ) => {
    try {
      if (action === "pause") {
        await pauseBatchTask(taskId);
      } else if (action === "resume") {
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
        await stopBatchTask(taskId);
      }
      await loadTasks();
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "任务操作失败";
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

    try {
      await cancelCrawlJob(jobId);
      await loadCrawlJobs();
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "抓取任务操作失败";
      notifyError("抓取任务操作失败", message);
    }
  };

  const closeCrawlJobDetails = () => {
    latestCrawlJobDetailsRequestIdRef.current += 1;
    setSelectedCrawlJob(null);
    setCrawlJobPages([]);
    setCrawlJobCandidates([]);
    setCrawlJobEvents([]);
    setCrawlJobDetailsLoading(false);
    lastCrawlJobDetailsLoadErrorRef.current = null;
  };

  if (!selectedIdentityId || !selectedLlmProfileId) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-3xl border border-dashed border-stone-300 bg-[#fcfbf8] p-10 text-center">
          <h1 className="text-2xl font-semibold text-stone-900">选择身份和模型</h1>
          <p className="mt-3 text-sm text-stone-600">任务页使用顶部选择的身份和模型。</p>
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
            <h1 className="text-3xl font-semibold text-stone-900">批量任务</h1>
            <p className="mt-2 text-sm text-stone-600">查看进度、排程和发送结果。</p>
          </div>
          <Link to="/" data-interactive="button" className="ui-btn-primary">
            返回首页继续选导师
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("batch")}
          className={
            activeTab === "batch"
              ? "ui-btn-primary"
              : "ui-btn-secondary"
          }
        >
          批量邮件
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("crawl")}
          className={
            activeTab === "crawl"
              ? "ui-btn-primary"
              : "ui-btn-secondary"
          }
        >
          教师抓取
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
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {tasks.map((task) => {
            const progress =
              task.target_count === 0
                ? 0
                : Math.round((task.completed_count / task.target_count) * 100);

            return (
              <article
                key={task.id}
                className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-stone-900">
                      {task.name}
                    </h2>
                    <p className="mt-2 text-sm text-stone-500">
                      {buildScheduleLabel(task)}
                    </p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                    {BATCH_TASK_STATUS_LABELS[task.status]}
                  </span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-stone-50 px-4 py-3">
                    <div className="text-sm text-stone-500">目标人数</div>
                    <div className="mt-2 text-lg font-semibold text-stone-900">
                      {task.target_count}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 px-4 py-3">
                    <div className="text-sm text-stone-500">已完成</div>
                    <div className="mt-2 text-lg font-semibold text-stone-900">
                      {task.completed_count}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-sm text-stone-500">
                    <span>任务进度</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
                  <div className="rounded-2xl border border-stone-100 px-3 py-2">
                    待手动生成 {task.pending_generation_count}
                  </div>
                  <div className="rounded-2xl border border-stone-100 px-3 py-2">
                    待审核 {task.review_required_count}
                  </div>
                  <div className="rounded-2xl border border-stone-100 px-3 py-2">
                    已排程 {task.scheduled_count}
                  </div>
                  <div className="rounded-2xl border border-stone-100 px-3 py-2">
                    已发送 {task.sent_count}
                  </div>
                  <div className="rounded-2xl border border-stone-100 px-3 py-2 text-red-600">
                    发送失败 {task.failed_count}
                  </div>
                  <div className="rounded-2xl border border-stone-100 px-3 py-2 text-emerald-700">
                    已回复 {task.replied_count}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
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
                  {task.status !== "stopped" && task.status !== "completed" ? (
                    <button
                      type="button"
                      onClick={() => void handleAction(task.id, "stop")}
                      className="ui-btn-danger"
                    >
                      <Square className="h-4 w-4" />
                      中止
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
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
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {crawlJobs.map((job) => (
            <article
              key={job.id}
              className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-stone-900">
                    {job.university} / {job.school}
                  </h2>
                  <p className="mt-2 break-all text-sm text-stone-500">
                    {job.start_url}
                  </p>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                  {CRAWL_JOB_STATUS_LABELS[job.status]}
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-stone-50 px-4 py-3">
                  <div className="text-sm text-stone-500">已抓页面</div>
                  <div className="mt-2 text-lg font-semibold text-stone-900">
                    已抓页面 {job.page_count}
                  </div>
                </div>
                <div className="rounded-2xl bg-stone-50 px-4 py-3">
                  <div className="text-sm text-stone-500">候选导师</div>
                  <div className="mt-2 text-lg font-semibold text-stone-900">
                    候选导师 {job.candidate_count}
                  </div>
                </div>
              </div>

              {job.latest_event_message ? (
                <p className="mt-5 rounded-2xl border border-stone-100 px-4 py-3 text-sm text-stone-600">
                  {job.latest_event_message}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedCrawlJob(job)}
                  className="ui-btn-secondary"
                >
                  查看日志
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
            </article>
          ))}
        </div>
      )}
      {selectedCrawlJob ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-stone-950/30 p-0 sm:p-6">
          <section
            role="dialog"
            aria-label="抓取任务日志"
            className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:max-w-3xl sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-5">
              <div>
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

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {crawlJobDetailsLoading ? (
                <div className="flex items-center gap-2 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在加载日志详情...
                </div>
              ) : null}

              <section>
                <h3 className="text-sm font-semibold text-stone-900">执行日志</h3>
                <div className="mt-3 space-y-2">
                  {crawlJobEvents.length > 0 ? (
                    crawlJobEvents.map((event) => (
                      <div key={event.id} className="rounded-2xl border border-stone-100 px-4 py-3">
                        <p className="text-sm text-stone-800">{event.message}</p>
                        <p className="mt-1 text-xs text-stone-500">{event.created_at ?? "--"}</p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
                      暂无执行日志。
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-stone-900">已抓页面</h3>
                <div className="mt-3 space-y-2">
                  {crawlJobPages.length > 0 ? (
                    crawlJobPages.map((page) => (
                      <div key={page.id} className="rounded-2xl border border-stone-100 px-4 py-3">
                        <p className="text-sm font-medium text-stone-800">{page.title ?? page.url}</p>
                        <p className="mt-1 break-all text-xs text-stone-500">{page.url}</p>
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
                <h3 className="text-sm font-semibold text-stone-900">候选导师</h3>
                <div className="mt-3 space-y-2">
                  {crawlJobCandidates.length > 0 ? (
                    crawlJobCandidates.map((candidate) => (
                      <div key={candidate.id} className="rounded-2xl border border-stone-100 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-stone-800">{candidate.name}</p>
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">
                            置信度 {Math.round(candidate.confidence * 100)}%
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-stone-500">{candidate.email ?? "暂无邮箱"}</p>
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
          </section>
        </div>
      ) : null}
      {confirmDialog}
    </main>
  );
};
