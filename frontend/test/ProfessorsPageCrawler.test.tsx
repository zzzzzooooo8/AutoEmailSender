import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/context/NotificationContext";
import { clearDiagnosticEvents, getDiagnosticEvents } from "@/lib/diagnostics";
import { ProfessorsPage } from "@/pages/ProfessorsPage";

const listProfessorsForManagement = vi.hoisted(() => vi.fn());
const createCrawlJob = vi.hoisted(() => vi.fn());
const listCrawlJobs = vi.hoisted(() => vi.fn());
const listCrawlCandidates = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/professorsApi", () => ({
  listProfessorsForManagement,
  archiveProfessor: vi.fn(),
  bulkArchiveProfessors: vi.fn(),
  createProfessor: vi.fn(),
  getProfessorTemplateDownloadUrl: vi.fn(() => "/templates/professors.xlsx"),
  importProfessorsFromFile: vi.fn(),
  importSampleProfessors: vi.fn(),
  restoreProfessor: vi.fn(),
  triggerCrawler: vi.fn(),
  updateProfessor: vi.fn(),
}));

vi.mock("@/lib/api/crawlJobsApi", () => ({
  createCrawlJob,
  listCrawlJobs,
  listCrawlCandidates,
}));

const renderPage = () =>
  render(
    <NotificationProvider>
      <ProfessorsPage />
    </NotificationProvider>,
  );

describe("ProfessorsPage crawler job entry", () => {
  beforeEach(() => {
    clearDiagnosticEvents();
    listProfessorsForManagement.mockReset();
    listProfessorsForManagement.mockResolvedValue([]);
    createCrawlJob.mockReset();
    createCrawlJob.mockResolvedValue({ id: 1 });
    listCrawlJobs.mockReset();
    listCrawlCandidates.mockReset();
  });

  it("opens the crawler dialog and creates a crawl job with the form payload", async () => {
    renderPage();

    await waitFor(() => {
      expect(listProfessorsForManagement).toHaveBeenCalledWith("active");
    });

    fireEvent.click(screen.getByRole("button", { name: "智能抓取" }));

    const dialog = screen.getByRole("dialog", { name: "创建抓取任务" });
    fireEvent.change(within(dialog).getByLabelText("学校"), {
      target: { value: "示例大学" },
    });
    fireEvent.change(within(dialog).getByLabelText("学院"), {
      target: { value: "计算机学院" },
    });
    fireEvent.change(within(dialog).getByLabelText("教师列表页面 URL"), {
      target: { value: "https://example.edu/faculty" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "开始抓取" }));

    await waitFor(() => {
      expect(createCrawlJob).toHaveBeenCalledWith({
        university: "示例大学",
        school: "计算机学院",
        start_url: "https://example.edu/faculty",
        llm_profile_id: null,
      });
    });

    expect(getDiagnosticEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "user_action",
          eventName: "professors.crawler_dialog_opened",
        }),
        expect.objectContaining({
          category: "user_action",
          eventName: "professors.crawl_job_create_submitted",
          data: {
            university: "示例大学",
            school: "计算机学院",
            start_url: "https://example.edu/faculty",
          },
        }),
        expect.objectContaining({
          category: "user_action",
          eventName: "professors.crawl_job_create_succeeded",
        }),
      ]),
    );
  });

  it("records a failed crawler job creation as a user action", async () => {
    createCrawlJob.mockRejectedValue(new Error("backend unavailable"));

    renderPage();

    await waitFor(() => {
      expect(listProfessorsForManagement).toHaveBeenCalledWith("active");
    });

    fireEvent.click(screen.getByRole("button", { name: "智能抓取" }));

    const dialog = screen.getByRole("dialog", { name: "创建抓取任务" });
    fireEvent.change(within(dialog).getByLabelText("学校"), {
      target: { value: "示例大学" },
    });
    fireEvent.change(within(dialog).getByLabelText("学院"), {
      target: { value: "计算机学院" },
    });
    fireEvent.change(within(dialog).getByLabelText("教师列表页面 URL"), {
      target: { value: "https://example.edu/faculty?token=secret#frag" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "开始抓取" }));

    await waitFor(() => {
      expect(createCrawlJob).toHaveBeenCalled();
    });

    expect(getDiagnosticEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "user_action",
          eventName: "professors.crawl_job_create_failed",
          message: "backend unavailable",
        }),
      ]),
    );
  });
});
