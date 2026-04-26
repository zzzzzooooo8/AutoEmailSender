import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TasksPage } from "@/pages/TasksPage";
import { listBatchTaskItems, listBatchTasks } from "@/lib/api/batchTasksApi";
import { clearDiagnosticEvents, getDiagnosticEvents } from "@/lib/diagnostics";
import {
  cancelCrawlJob,
  getCrawlJobEvents,
  listCrawlCandidates,
  listCrawlJobs,
  listCrawlPages,
} from "@/lib/api/crawlJobsApi";

const mockedUseSelectionContext = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());

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
    confirm,
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

vi.mock("@/lib/api/crawlJobsApi", () => ({
  listCrawlJobs: vi.fn(),
  cancelCrawlJob: vi.fn(),
  listCrawlPages: vi.fn(),
  listCrawlCandidates: vi.fn(),
  getCrawlJobEvents: vi.fn(),
}));

const runningJob = {
  id: 7,
  university: "示例大学",
  school: "计算机学院",
  start_url: "https://example.edu/faculty",
  llm_profile_id: 2,
  status: "running",
  progress_current: 0,
  progress_total: 0,
  error_message: null,
  created_at: "2026-04-26T10:00:00Z",
  updated_at: "2026-04-26T10:00:00Z",
  page_count: 12,
  candidate_count: 34,
  latest_event_message: "正在分析教师列表",
} as const;

const buildCrawlJob = (id: number) => ({
  ...runningJob,
  id,
  university: `示例大学 ${id}`,
  school: "计算机学院",
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <TasksPage />
    </MemoryRouter>,
  );

describe("TasksPage crawler jobs tab", () => {
  beforeEach(() => {
    clearDiagnosticEvents();
    vi.clearAllMocks();
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 2,
    });
    confirm.mockResolvedValue(true);
    vi.mocked(listBatchTasks).mockResolvedValue([]);
    vi.mocked(listBatchTaskItems).mockResolvedValue([]);
    vi.mocked(listCrawlJobs).mockResolvedValue([runningJob]);
    vi.mocked(cancelCrawlJob).mockResolvedValue(runningJob);
    vi.mocked(listCrawlPages).mockResolvedValue([
      {
        id: 11,
        job_id: 7,
        url: "https://example.edu/faculty",
        parent_url: null,
        fetch_method: "http",
        page_type: "faculty_list",
        status: "fetched",
        title: "Faculty",
        text_excerpt: null,
        error_message: null,
        created_at: "2026-04-26T10:01:00Z",
      },
    ]);
    vi.mocked(listCrawlCandidates).mockResolvedValue([
      {
        id: 21,
        job_id: 7,
        professor_id: null,
        name: "张教授",
        email: null,
        title: null,
        university: "示例大学",
        school: "计算机学院",
        department: null,
        research_direction: null,
        recent_papers: [],
        profile_url: null,
        source_url: "https://example.edu/faculty",
        confidence: 0.86,
        field_confidence: null,
        evidence: null,
        review_status: "pending",
        created_at: "2026-04-26T10:02:00Z",
        updated_at: "2026-04-26T10:02:00Z",
      },
    ]);
    vi.mocked(getCrawlJobEvents).mockResolvedValue([
      {
        id: "evt-1",
        job_id: 7,
        event_type: "crawl_page",
        message: "调用 crawl_page 抓取入口页面",
        created_at: "2026-04-26T08:34:00",
        raw: null,
      },
    ]);
  });

  it("shows crawl job cards after switching to the crawler tab", async () => {
    renderPage();

    await waitFor(() => {
      expect(listCrawlJobs).toHaveBeenCalled();
    });

    const crawlerSummaryCard =
      screen.getAllByText("教师抓取")[0].closest("div")?.parentElement;
    expect(crawlerSummaryCard).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "教师抓取" }));

    await waitFor(() => {
      expect(listCrawlJobs).toHaveBeenCalled();
    });

    expect(screen.getByText("示例大学 / 计算机学院")).toBeInTheDocument();
    expect(screen.getByText("https://example.edu/faculty")).toBeInTheDocument();
    expect(screen.getByText("已抓页面 12")).toBeInTheDocument();
    expect(screen.getByText("候选导师 34")).toBeInTheDocument();
    expect(screen.getByText("正在分析教师列表")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看详情" })).toBeEnabled();
  });

  it("opens and closes the crawl job log dialog", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "教师抓取" }));

    const logButton = await screen.findByRole("button", { name: "查看详情" });
    fireEvent.click(logButton);

    const dialog = await screen.findByRole("dialog", { name: "抓取任务详情" });
    expect(dialog).toBeInTheDocument();
    expect(listCrawlPages).toHaveBeenCalledWith(7);
    expect(listCrawlCandidates).toHaveBeenCalledWith(7);
    expect(getCrawlJobEvents).toHaveBeenCalledWith(7);
    expect(getDiagnosticEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "user_action",
          eventName: "tasks.crawl_job_detail_opened",
          data: {
            jobId: 7,
            status: "running",
          },
        }),
      ]),
    );
    expect(screen.getByText("调用 crawl_page 抓取入口页面")).toBeInTheDocument();
    expect(screen.getByText("04/26 16:34")).toBeInTheDocument();
    expect(screen.getByText("Faculty")).toBeInTheDocument();
    expect(screen.getByText("张教授")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "抓取任务详情" })).not.toBeInTheDocument();
    });
  });

  it("paginates crawl job cards", async () => {
    vi.mocked(listCrawlJobs).mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => buildCrawlJob(index + 1)),
    );

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "教师抓取" }));

    expect(await screen.findByText("示例大学 1 / 计算机学院")).toBeInTheDocument();
    expect(screen.getByText("示例大学 8 / 计算机学院")).toBeInTheDocument();
    expect(screen.queryByText("示例大学 9 / 计算机学院")).not.toBeInTheDocument();
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(await screen.findByText("示例大学 9 / 计算机学院")).toBeInTheDocument();
    expect(screen.queryByText("示例大学 1 / 计算机学院")).not.toBeInTheDocument();
    expect(screen.getByText("显示 9-9 / 9 个任务")).toBeInTheDocument();
  });

  it("closes the crawl job details dialog when clicking the backdrop", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "教师抓取" }));

    fireEvent.click(await screen.findByRole("button", { name: "查看详情" }));

    const dialog = await screen.findByRole("dialog", { name: "抓取任务详情" });
    fireEvent.click(dialog.parentElement as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "抓取任务详情" })).not.toBeInTheDocument();
    });
  });

  it("cancels a running crawl job from the crawler tab", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "教师抓取" }));

    const cancelButton = await screen.findByRole("button", { name: "取消抓取" });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(cancelCrawlJob).toHaveBeenCalledWith(7);
    });
    expect(getDiagnosticEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "user_action",
          eventName: "tasks.crawl_job_cancel_submitted",
          data: { jobId: 7 },
        }),
        expect.objectContaining({
          category: "user_action",
          eventName: "tasks.crawl_job_cancel_succeeded",
          data: { jobId: 7 },
        }),
      ]),
    );
  });
});
