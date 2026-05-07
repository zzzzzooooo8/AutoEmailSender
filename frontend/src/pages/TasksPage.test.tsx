import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import type { CrawlJobSummaryDTO } from "@/types";
import { CrawlJobCard } from "./TasksPage";

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
