import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { HomePage } from "@/pages/HomePage";
import type { IdentityDTO, LLMProfileDTO, ProfessorDashboardItemDTO } from "@/types";

const mockedUseSelectionContext = vi.hoisted(() => vi.fn());
const mockedListProfessors = vi.hoisted(() => vi.fn());
const mockedCalculateMatch = vi.hoisted(() => vi.fn());
const mockedEnsureWorkspaceTask = vi.hoisted(() => vi.fn());
const mockedNotifyError = vi.hoisted(() => vi.fn());
const mockedNotifySuccess = vi.hoisted(() => vi.fn());
const mockedNotifyWarning = vi.hoisted(() => vi.fn());

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: mockedUseSelectionContext,
}));

vi.mock("@/lib/api/professorsApi", () => ({
  listProfessors: mockedListProfessors,
}));

vi.mock("@/lib/api/emailTasksApi", () => ({
  calculateMatch: mockedCalculateMatch,
}));

vi.mock("@/lib/api/workspacesApi", () => ({
  ensureWorkspaceTask: mockedEnsureWorkspaceTask,
}));

vi.mock("@/lib/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(),
    dialog: null,
  }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({
    notifyError: mockedNotifyError,
    notifySuccess: mockedNotifySuccess,
    notifyWarning: mockedNotifyWarning,
  }),
}));

const createIdentity = (overrides: Partial<IdentityDTO> = {}): IdentityDTO => ({
  id: 1,
  name: "测试身份",
  profile_name: "测试身份",
  sender_name: "测试身份",
  email_address: "sender@example.com",
  smtp_host: "smtp.example.com",
  smtp_port: 465,
  smtp_username: "sender@example.com",
  smtp_password: "secret",
  imap_host: null,
  imap_port: null,
  imap_username: null,
  imap_password: null,
  default_language: "zh-CN",
  outreach_generation_mode: "template",
  outreach_template_subject: "申请与{{name}}老师交流",
  outreach_template_body_text: "老师您好，我是{{sender_name}}。",
  outreach_template_body_html: "",
  current_primary_material_id: 11,
  current_primary_material: null,
  match_threshold: null,
  daily_send_limit: null,
  send_interval_min: null,
  send_interval_max: null,
  same_domain_cooldown_minutes: null,
  is_default: true,
  materials: [],
  created_at: "2026-04-22T00:00:00Z",
  updated_at: "2026-04-22T00:00:00Z",
  ...overrides,
});

const selectedLlmProfile: LLMProfileDTO = {
  id: 1,
  name: "测试模型",
  provider: "openai",
  api_base_url: null,
  api_key: "test-key",
  model_name: "gpt-test",
  matcher_prompt_template: null,
  writer_prompt_template: null,
  temperature: null,
  max_tokens: null,
  is_default: true,
  created_at: "2026-04-22T00:00:00Z",
  updated_at: "2026-04-22T00:00:00Z",
};

const createProfessor = (id: number, name: string): ProfessorDashboardItemDTO => ({
  id,
  name,
  email: `${id}@example.com`,
  title: "教授",
  university: "测试大学",
  school: "计算机学院",
  department: "人工智能系",
  research_direction: "多智能体系统",
  recent_papers: ["Paper A"],
  match_score: null,
  sent_count: 0,
  status: "preparing",
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );

describe("HomePage match analysis", () => {
  beforeEach(() => {
    mockedListProfessors.mockReset();
    mockedCalculateMatch.mockReset();
    mockedEnsureWorkspaceTask.mockReset();
    mockedNotifyError.mockReset();
    mockedNotifySuccess.mockReset();
    mockedNotifyWarning.mockReset();
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
      selectedIdentity: createIdentity(),
      selectedLlmProfile,
    });
    mockedListProfessors.mockResolvedValue([
      createProfessor(101, "王教授"),
      createProfessor(102, "李教授"),
    ]);
    mockedEnsureWorkspaceTask.mockImplementation(async (professorId: number) => ({
      current_task: { id: professorId + 1000 },
    }));
  });

  it("shows a warning when a single match request returns 409", async () => {
    mockedCalculateMatch.mockRejectedValue(new ApiError(409, "该任务正在分析中"));

    renderPage();

    const buttons = await screen.findAllByRole("button", { name: "分析匹配度" });
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(mockedNotifyWarning).toHaveBeenCalledWith(
        "匹配分析进行中",
        "该任务正在分析中，请稍后刷新结果。",
      );
    });
    expect(mockedNotifyError).not.toHaveBeenCalled();
  });

  it("continues batch scoring after one 409 conflict", async () => {
    mockedCalculateMatch
      .mockRejectedValueOnce(new ApiError(409, "该任务正在分析中"))
      .mockResolvedValueOnce({
        thread: {} as never,
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
          cached_tokens: 0,
        },
        run_id: 1,
      });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "选择 王教授" }));
    fireEvent.click(screen.getByRole("button", { name: "选择 李教授" }));
    fireEvent.click(screen.getByRole("button", { name: "批量分析匹配度" }));

    await waitFor(() => {
      expect(mockedNotifyError).toHaveBeenCalledWith(
        "部分导师计算失败",
        expect.stringContaining("王教授：正在分析中"),
      );
    });
    expect(mockedCalculateMatch).toHaveBeenCalledTimes(2);
  });
});
