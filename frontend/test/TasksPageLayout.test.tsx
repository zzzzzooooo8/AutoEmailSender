import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TasksPage } from "@/pages/TasksPage";
import { listBatchTasks } from "@/lib/api/batchTasksApi";

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
  listBatchTasks: vi.fn(),
  pauseBatchTask: vi.fn(),
  resumeBatchTask: vi.fn(),
  stopBatchTask: vi.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <TasksPage />
    </MemoryRouter>,
  );

describe("TasksPage layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 2,
    });
    vi.mocked(listBatchTasks).mockResolvedValue([]);
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
      .getByRole("heading", { name: "批量任务" })
      .closest("main");

    expect(pageShell).toHaveClass("max-w-7xl");
  });
});
