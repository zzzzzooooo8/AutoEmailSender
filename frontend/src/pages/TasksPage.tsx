import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pause, Play, Square } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useSelectionContext } from "@/context/SelectionContext";
import { useConfirmDialog } from "@/lib/useConfirmDialog";
import {
  listBatchTasks,
  pauseBatchTask,
  resumeBatchTask,
  stopBatchTask,
} from "@/lib/api/batchTasksApi";
import { cancelCrawlJob, listCrawlJobs } from "@/lib/api/crawlJobsApi";
import {
  BATCH_TASK_STATUS_LABELS,
  type BatchTaskCardDTO,
  type CrawlJobStatusDTO,
  type CrawlJobSummaryDTO,
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
  const lastLoadErrorRef = useRef<string | null>(null);
  const lastCrawlJobsLoadErrorRef = useRef<string | null>(null);
  const loadedTasksKeyRef = useRef<string | null>(null);
  const activeTasksRequestKeyRef = useRef<string | null>(null);
  const latestTasksRequestIdRef = useRef(0);
  const latestCrawlJobsRequestIdRef = useRef(0);
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
                  disabled
                  className="ui-btn-secondary cursor-not-allowed opacity-60"
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
      {confirmDialog}
    </main>
  );
};
