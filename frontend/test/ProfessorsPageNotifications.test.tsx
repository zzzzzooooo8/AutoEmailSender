import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/context/NotificationContext";
import { ProfessorsPage } from "@/pages/ProfessorsPage";

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

describe("ProfessorsPage notifications", () => {
  beforeEach(() => {
    listProfessorsForManagement.mockReset();
    listProfessorsForManagement.mockResolvedValue([]);
  });

  it("shows the empty-import validation as a notification card", async () => {
    render(
      <NotificationProvider>
        <ProfessorsPage />
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(listProfessorsForManagement).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));
    fireEvent.click(screen.getByRole("button", { name: "开始导入" }));

    const message = screen.getByText("请先选择要导入的 csv 或 xlsx 文件");
    expect(message.closest('[data-testid="notification-card"]')).not.toBeNull();
  });
});
