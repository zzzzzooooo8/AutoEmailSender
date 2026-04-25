import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/context/NotificationContext";
import { ProfessorsPage } from "@/pages/ProfessorsPage";
import type { ProfessorManagementItemDTO } from "@/types";

const listProfessorsForManagement = vi.hoisted(() => vi.fn());

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

const professor: ProfessorManagementItemDTO = {
  id: 1,
  name: "李教授",
  email: "li@example.edu",
  title: "Associate Professor",
  university: "测试大学",
  school: "计算机学院",
  department: "人工智能系",
  research_direction: "机器学习与人机协作",
  recent_papers: ["Paper A"],
  profile_url: "https://example.edu/li",
  source_url: null,
  crawl_status: "manual",
  skip_reason: null,
  archived_at: null,
  created_at: "2026-04-22T00:00:00Z",
  updated_at: "2026-04-23T00:00:00Z",
};

const renderPage = () =>
  render(
    <NotificationProvider>
      <ProfessorsPage />
    </NotificationProvider>,
  );

describe("ProfessorsPage layout", () => {
  beforeEach(() => {
    listProfessorsForManagement.mockReset();
    listProfessorsForManagement.mockResolvedValue([professor]);
  });

  it("keeps row field labels inside each professor record for responsive reading", async () => {
    renderPage();

    await waitFor(() => {
      expect(listProfessorsForManagement).toHaveBeenCalledWith("active");
    });

    const row = screen.getByText("李教授").closest("article");
    expect(row).not.toBeNull();
    const record = within(row as HTMLElement);

    expect(record.getByText("邮箱")).toBeInTheDocument();
    expect(record.getByText("学校 / 学院")).toBeInTheDocument();
    expect(record.getByText("研究方向")).toBeInTheDocument();
    expect(record.getByText("更新时间")).toBeInTheDocument();
    expect(record.getByRole("button", { name: "选择 李教授" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      record.queryByRole("checkbox", { name: "选择 李教授" }),
    ).not.toBeInTheDocument();
    expect(row?.firstElementChild).toHaveClass("lg:items-center");
  });

  it("centers every desktop table header within its column", async () => {
    renderPage();

    await waitFor(() => {
      expect(listProfessorsForManagement).toHaveBeenCalledWith("active");
    });

    const expectedHeaders = [
      "选择",
      "导师",
      "邮箱",
      "学校 / 学院",
      "研究方向",
      "更新时间",
      "操作",
    ];

    const header = screen.getByTestId("professor-table-header");

    expectedHeaders.forEach((label) => {
      expect(within(header).getByText(label)).toHaveClass(
        "justify-center",
        "text-center",
      );
    });
  });
});
