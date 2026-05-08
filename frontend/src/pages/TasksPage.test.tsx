import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import type { BatchTaskCardDTO, BatchTaskItemDTO, CrawlJobSummaryDTO } from "@/types";
import {
  buildBatchPendingItemAction,
  getBatchTaskWaitingSendCount,
} from "@/features/batch-tasks/client/batchTaskDisplay";
import {
  CrawlJobCard,
  TaskListViewSwitch,
} from "./TasksPage";

const buildCrawlJob = (
  overrides: Partial<CrawlJobSummaryDTO> = {},
): CrawlJobSummaryDTO => ({
  id: 9,
  university: "江西财经大学",
  school: "计算机与人工智能学院",
  start_url: "https://sim.jxufe.edu.cn/#/staff/detail/5",
  start_urls: ["https://sim.jxufe.edu.cn/#/staff/detail/5"],
  entry_type: "profile",
  llm_profile_id: 1,
  status: "failed",
  progress_current: 5,
  progress_total: 8,
  error_message: null,
  created_at: "2026-05-01T14:40:00",
  updated_at: "2026-05-01T14:49:02",
  deleted_at: null,
  page_count: 5,
  candidate_count: 1,
  latest_event_message:
    "入口 URL 抓取失败: Blocked by anti-bot protection: Structural: minimal_text, no_content_elements (52 bytes, 13 chars visible)",
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  duration_seconds: 0,
  ...overrides,
});

describe("CrawlJobCard", () => {
  it("uses a separated responsive layout and truncates long latest events", () => {
    const job = buildCrawlJob();

    render(
      <CrawlJobCard
        job={job}
        listView="current"
        pausingCrawlJobId={null}
        resumingCrawlJobId={null}
        retryingCrawlJobId={null}
        resumingCrawlJobReviewId={null}
        onOpenDetails={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        onResumeReview={vi.fn()}
        onDelete={vi.fn()}
        onRestore={vi.fn()}
        formatUpdatedAt={() => "05/01 14:49:02"}
      />,
    );

    const layout = screen.getByTestId("crawl-job-card-layout");
    expect(layout.className).toContain("xl:flex-row");

    const infoGrid = screen.getByTestId("crawl-job-card-info-grid");
    expect(infoGrid.className).toContain(
      "xl:grid-cols-[minmax(320px,1.3fr)_240px_minmax(280px,0.95fr)]",
    );

    const latestEvent = screen.getByTestId("crawl-job-card-latest-event");
    expect(latestEvent).toHaveClass("line-clamp-2");
    expect(latestEvent).toHaveClass("break-all");
    expect(latestEvent).toHaveAttribute("title", job.latest_event_message);
  });

  it("shows delete action only in the current list", () => {
    render(
      <CrawlJobCard
        job={buildCrawlJob()}
        listView="current"
        pausingCrawlJobId={null}
        resumingCrawlJobId={null}
        retryingCrawlJobId={null}
        resumingCrawlJobReviewId={null}
        onOpenDetails={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        onResumeReview={vi.fn()}
        onDelete={vi.fn()}
        onRestore={vi.fn()}
        formatUpdatedAt={() => "05/01 14:49:02"}
      />,
    );

    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "恢复" })).not.toBeInTheDocument();
  });

  it("shows restore action only in the trash list", () => {
    render(
      <CrawlJobCard
        job={buildCrawlJob({ deleted_at: "2026-05-07T10:00:00" })}
        listView="trash"
        pausingCrawlJobId={null}
        resumingCrawlJobId={null}
        retryingCrawlJobId={null}
        resumingCrawlJobReviewId={null}
        onOpenDetails={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        onResumeReview={vi.fn()}
        onDelete={vi.fn()}
        onRestore={vi.fn()}
        formatUpdatedAt={() => "05/01 14:49:02"}
      />,
    );

    expect(screen.getByRole("button", { name: "恢复" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重启抓取" })).not.toBeInTheDocument();
  });
});

const buildBatchTask = (
  overrides: Partial<BatchTaskCardDTO> = {},
): BatchTaskCardDTO => ({
  id: 1,
  name: "模板定时任务",
  status: "running",
  schedule_type: "scheduled",
  scheduled_dates: ["2026-05-08"],
  window_start_time: "09:00",
  window_end_time: "11:00",
  emails_per_window: 10,
  email_subject: "申请交流",
  target_count: 1,
  completed_count: 0,
  identity_id: 1,
  llm_profile_id: 2,
  pending_generation_count: 0,
  generating_draft_count: 0,
  draft_failed_count: 0,
  review_required_count: 0,
  approved_count: 1,
  scheduled_count: 0,
  sent_count: 0,
  failed_count: 0,
  replied_count: 0,
  created_at: "2026-05-08T00:00:00",
  updated_at: "2026-05-08T00:00:00",
  deleted_at: null,
  ...overrides,
});

const buildBatchItem = (
  overrides: Partial<BatchTaskItemDTO> = {},
): BatchTaskItemDTO => ({
  id: 11,
  professor_id: 21,
  professor_name: "模板直通导师",
  professor_email: "mentor@example.edu",
  professor_title: "Professor",
  professor_school: "School of Computing",
  status: "approved",
  cancellation_reason: null,
  match_score: null,
  scheduled_at: null,
  sent_at: null,
  last_send_attempt_at: null,
  last_error: null,
  is_replied: false,
  updated_at: "2026-05-08T00:00:00",
  ...overrides,
});

describe("TaskListViewSwitch", () => {
  it("aligns the current/trash switch to the right edge", () => {
    render(
      <TaskListViewSwitch
        activeView="current"
        onViewChange={vi.fn()}
      />,
    );

    const switchContainer = screen.getByTestId("task-list-view-switch");
    expect(switchContainer).toHaveClass("justify-end");
    expect(switchContainer).not.toHaveClass("mt-4");

    const activeButton = screen.getByRole("button", { name: "当前任务" });
    expect(activeButton).toHaveClass("bg-primary");
    expect(activeButton).not.toHaveClass("bg-stone-900");
  });
});

describe("batch task send queue copy", () => {
  it("counts approved and scheduled items as waiting to send", () => {
    const task = buildBatchTask({
      approved_count: 3,
      scheduled_count: 2,
    });

    expect(getBatchTaskWaitingSendCount(task)).toBe(5);
  });

  it("explains scheduled template items without asking users to process each one", () => {
    const action = buildBatchPendingItemAction(
      buildBatchItem({ status: "approved", scheduled_at: null }),
      buildBatchTask({ schedule_type: "scheduled" }),
    );

    expect(action.kind).toBe("message");
    expect(action.text).toBe("等待批量定时窗口自动发送");
  });

  it("keeps AI rewritten drafts as manual review work", () => {
    const action = buildBatchPendingItemAction(
      buildBatchItem({ status: "review_required" }),
      buildBatchTask({ schedule_type: "scheduled" }),
    );

    expect(action.kind).toBe("link");
    expect(action.text).toBe("审核草稿");
  });
});
