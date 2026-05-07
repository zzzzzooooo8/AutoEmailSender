import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TasksPage } from "@/pages/TasksPage";
import { listBatchTaskItems, listBatchTasks } from "@/lib/api/batchTasksApi";
import { listMatchAnalysisJobs } from "@/lib/api/matchAnalysisJobsApi";

const mockedUseSelectionContext = vi.hoisted(() => vi.fn());

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: mockedUseSelectionContext,
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({
    notifyError: vi.fn(),
  }),
}));

vi.mock("@/lib/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(),
    dialog: null,
  }),
}));

vi.mock("@/lib/api/batchTasksApi", () => ({
  listBatchTaskItems: vi.fn(),
  listBatchTasks: vi.fn(),
  pauseBatchTask: vi.fn(),
  resumeBatchTask: vi.fn(),
  stopBatchTask: vi.fn(),
}));

vi.mock("@/lib/api/matchAnalysisJobsApi", () => ({
  listMatchAnalysisJobItems: vi.fn(),
  listMatchAnalysisJobs: vi.fn(),
  cancelMatchAnalysisJob: vi.fn(),
  retryFailedMatchAnalysisJob: vi.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <TasksPage />
    </MemoryRouter>,
  );

const runningTask = {
  id: 3,
  name: "春季套磁任务",
  status: "running",
  schedule_type: "scheduled",
  window_start_time: "09:00",
  window_end_time: "18:00",
  emails_per_window: 20,
  email_subject: "申请加入课题组",
  target_count: 10,
  completed_count: 4,
  identity_id: 1,
  llm_profile_id: 2,
  pending_generation_count: 2,
  generating_draft_count: 0,
  draft_failed_count: 0,
  review_required_count: 1,
  scheduled_count: 3,
  sent_count: 4,
  failed_count: 0,
  replied_count: 1,
  created_at: "2026-04-26T10:00:00Z",
  updated_at: "2026-04-26T11:00:00Z",
} as const;

const buildTask = (id: number) => ({
  ...runningTask,
  id,
  name: `批量邮件任务 ${id}`,
});

const sentTaskItem = {
  id: 31,
  professor_id: 101,
  professor_name: "王老师",
  professor_email: "wang@example.edu",
  professor_title: "教授",
  professor_school: "计算机学院",
  status: "sent",
  match_score: 88,
  scheduled_at: null,
  sent_at: "2026-04-26T11:30:00Z",
  last_send_attempt_at: "2026-04-26T11:30:00Z",
  last_error: null,
  is_replied: false,
  updated_at: "2026-04-26T11:30:00Z",
} as const;

const pendingTaskItem = {
  id: 32,
  professor_id: 102,
  professor_name: "李老师",
  professor_email: "li@example.edu",
  professor_title: "副教授",
  professor_school: "软件学院",
  status: "review_required",
  match_score: 76,
  scheduled_at: null,
  sent_at: null,
  last_send_attempt_at: null,
  last_error: null,
  is_replied: false,
  updated_at: "2026-04-26T11:20:00Z",
} as const;

describe("TasksPage layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 2,
    });
    vi.mocked(listBatchTasks).mockResolvedValue([]);
    vi.mocked(listBatchTaskItems).mockResolvedValue([]);
    vi.mocked(listMatchAnalysisJobs).mockResolvedValue([]);
  });

  it("uses the same wide page shell as the other primary pages", async () => {
    renderPage();

    await waitFor(() => {
      expect(listBatchTasks).toHaveBeenCalledWith({
        identityId: 1,
        llmProfileId: 2,
      });
    });

    const pageShell = screen
      .getByRole("heading", { name: "任务中心" })
      .closest("main");

    expect(pageShell).toHaveClass("max-w-7xl");
    expect(screen.getByRole("button", { name: "批量邮件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "教师抓取" })).toBeInTheDocument();
  });

  it("preloads match analysis count before the match tab is opened", async () => {
    vi.mocked(listMatchAnalysisJobs).mockResolvedValue([
      {
        id: 9,
        name: "鍖归厤鍒嗘瀽浠诲姟",
        status: "running",
        target_count: 3,
        succeeded_count: 1,
        failed_count: 0,
        skipped_count: 0,
        total_prompt_tokens: 100,
        total_completion_tokens: 20,
        total_tokens: 120,
        identity_id: 1,
        llm_profile_id: 2,
        cancel_requested_at: null,
        started_at: "2026-04-26T10:00:00Z",
        finished_at: null,
        created_at: "2026-04-26T10:00:00Z",
        updated_at: "2026-04-26T10:01:00Z",
        last_error: null,
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(listMatchAnalysisJobs).toHaveBeenCalledWith({
        identityId: 1,
        llmProfileId: 2,
      });
    });

    expect(screen.getByRole("button", { name: "匹配分析" })).toHaveTextContent("1");
  });

  it("opens batch task details from the single-column task list", async () => {
    vi.mocked(listBatchTasks).mockResolvedValue([runningTask]);
    vi.mocked(listBatchTaskItems).mockResolvedValue([sentTaskItem, pendingTaskItem]);

    renderPage();

    const detailButton = await screen.findByRole("button", { name: "查看详情" });
    fireEvent.click(detailButton);

    const dialog = await screen.findByRole("dialog", { name: "批量任务详情" });
    expect(dialog).toBeInTheDocument();
    expect(listBatchTaskItems).toHaveBeenCalledWith(3);
    expect(within(dialog).getByText("春季套磁任务")).toBeInTheDocument();
    expect(within(dialog).getByText("申请加入课题组")).toBeInTheDocument();
    expect(within(dialog).getByText("已发送给")).toBeInTheDocument();
    expect(within(dialog).getByText("王老师")).toBeInTheDocument();
    expect(within(dialog).getByText("还未发送给")).toBeInTheDocument();
    expect(within(dialog).getByText("李老师")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "批量任务详情" })).not.toBeInTheDocument();
    });
  });

  it("paginates batch task cards", async () => {
    vi.mocked(listBatchTasks).mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => buildTask(index + 1)),
    );

    renderPage();

    expect(await screen.findByText("批量邮件任务 1")).toBeInTheDocument();
    expect(screen.getByText("批量邮件任务 8")).toBeInTheDocument();
    expect(screen.queryByText("批量邮件任务 9")).not.toBeInTheDocument();
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(await screen.findByText("批量邮件任务 9")).toBeInTheDocument();
    expect(screen.queryByText("批量邮件任务 1")).not.toBeInTheDocument();
    expect(screen.getByText("显示 9-9 / 9 个任务")).toBeInTheDocument();
  });

  it("closes batch task details when clicking the backdrop", async () => {
    vi.mocked(listBatchTasks).mockResolvedValue([runningTask]);
    vi.mocked(listBatchTaskItems).mockResolvedValue([sentTaskItem, pendingTaskItem]);

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "查看详情" }));

    const dialog = await screen.findByRole("dialog", { name: "批量任务详情" });
    fireEvent.click(dialog.parentElement as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "批量任务详情" })).not.toBeInTheDocument();
    });
  });
});
