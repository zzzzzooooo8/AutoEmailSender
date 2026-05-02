import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/context/NotificationContext";
import { ProfessorsPage } from "@/pages/ProfessorsPage";

const listProfessorsForManagement = vi.hoisted(() => vi.fn());
const importProfessorsFromFile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/professorsApi", () => ({
  listProfessorsForManagement,
  archiveProfessor: vi.fn(),
  bulkArchiveProfessors: vi.fn(),
  createProfessor: vi.fn(),
  getProfessorTemplateDownloadUrl: vi.fn(() => "/templates/professors.xlsx"),
  importProfessorsFromFile,
  restoreProfessor: vi.fn(),
  triggerCrawler: vi.fn(),
  updateProfessor: vi.fn(),
}));

const renderPage = () =>
  render(
    <NotificationProvider>
      <ProfessorsPage />
    </NotificationProvider>,
  );

const getWorkbenchRegion = () =>
  screen.getByRole("region", { name: "导师档案工作台" });

describe("ProfessorsPage notifications", () => {
  beforeEach(() => {
    listProfessorsForManagement.mockReset();
    listProfessorsForManagement.mockResolvedValue([]);
    importProfessorsFromFile.mockReset();
  });

  it("shows the empty-import validation as a notification card", async () => {
    renderPage();

    await waitFor(() => {
      expect(listProfessorsForManagement).toHaveBeenCalled();
    });

    fireEvent.click(
      within(getWorkbenchRegion()).getByRole("button", {
        name: "导入文件",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "开始导入" }));

    const message = screen.getByText("请先选择要导入的 csv 或 xlsx 文件");
    expect(message.closest('[data-testid="notification-card"]')).not.toBeNull();
  });

  it("explains that import templates include guidance and ignored examples", async () => {
    renderPage();

    await waitFor(() => {
      expect(listProfessorsForManagement).toHaveBeenCalled();
    });

    fireEvent.click(
      within(getWorkbenchRegion()).getByRole("button", {
        name: "导入文件",
      }),
    );

    expect(screen.getByText(/模板内已包含字段说明和示例行/)).toBeInTheDocument();
    expect(screen.getByText(/示例行可以保留，导入时会自动忽略/)).toBeInTheDocument();
    expect(screen.getByText(/recent_papers/)).toBeInTheDocument();
    expect(screen.getByText(/research_direction/)).toBeInTheDocument();
    expect(screen.getByText(/中文分号/)).toBeInTheDocument();
    expect(screen.getByText(/最多保留前 8 篇/)).toBeInTheDocument();
  });

  it("keeps the import result detail card while showing a success notification after import", async () => {
    importProfessorsFromFile.mockResolvedValue({
      message: "已完成导师导入",
      inserted_count: 2,
      updated_count: 1,
      failed_count: 0,
    });

    renderPage();

    await waitFor(() => {
      expect(listProfessorsForManagement).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(
      within(getWorkbenchRegion()).getByRole("button", {
        name: "导入文件",
      }),
    );

    const fileInput = document.querySelector(
      'input[type="file"][accept=".csv,.xlsx"]',
    ) as HTMLInputElement | null;

    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [
          new File(["name,email\n张三,zhangsan@example.com"], "professors.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "开始导入" }));

    await waitFor(() => {
      expect(importProfessorsFromFile).toHaveBeenCalledTimes(1);
    });

    const notificationCard = await screen.findByTestId("notification-card");
    expect(within(notificationCard).getByText("导入完成")).toBeInTheDocument();
    expect(within(notificationCard).getByText("已完成导师导入")).toBeInTheDocument();

    expect(screen.getByText("新增 2")).toBeInTheDocument();
    expect(screen.getByText("更新 1")).toBeInTheDocument();
    expect(screen.getByText("失败 0")).toBeInTheDocument();
  });
});
