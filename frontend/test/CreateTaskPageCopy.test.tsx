import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateTaskPage } from "@/pages/CreateTaskPage";
import type { IdentityDTO, LLMProfileDTO, ProfessorDashboardItemDTO } from "@/types";

const mockedUseSelectionContext = vi.hoisted(() => vi.fn());
const mockedListProfessors = vi.hoisted(() => vi.fn());
const mockedCreateBatchTask = vi.hoisted(() => vi.fn());

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: mockedUseSelectionContext,
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({
    notifyError: vi.fn(),
    notifyFormErrors: vi.fn(),
  }),
}));

vi.mock("@/lib/api/professorsApi", () => ({
  listProfessors: mockedListProfessors,
}));

vi.mock("@/lib/api/batchTasksApi", () => ({
  createBatchTask: mockedCreateBatchTask,
}));

const selectedIdentity: IdentityDTO = {
  id: 1,
  name: "测试身份",
  email_address: "sender@example.com",
  smtp_host: "smtp.example.com",
  smtp_port: 465,
  smtp_username: "sender@example.com",
  smtp_password: "secret",
  imap_host: "imap.example.com",
  imap_port: 993,
  imap_username: "sender@example.com",
  imap_password: "secret",
  default_language: "zh-CN",
  outreach_generation_mode: "llm",
  outreach_template_subject: "测试主题",
  outreach_template_body_text: "测试正文",
  outreach_template_body_html: null,
  current_primary_material_id: null,
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
};

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

const professor: ProfessorDashboardItemDTO = {
  id: 101,
  name: "王教授",
  email: "prof@example.com",
  title: "教授",
  university: "测试大学",
  school: "计算机学院",
  department: "人工智能系",
  research_direction: "多智能体系统",
  recent_papers: [],
  match_score: 90,
  sent_count: 0,
  status: "matched",
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <CreateTaskPage />
    </MemoryRouter>,
  );

describe("CreateTaskPage copy", () => {
  beforeEach(() => {
    window.sessionStorage.setItem("selected_professor_ids", JSON.stringify([professor.id]));
    mockedListProfessors.mockReset();
    mockedCreateBatchTask.mockReset();
    mockedListProfessors.mockResolvedValue([professor]);
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: selectedIdentity.id,
      selectedLlmProfileId: selectedLlmProfile.id,
      selectedIdentity,
      selectedLlmProfile,
    });
  });

  it("shows the action-oriented task mode copy and next-step hint", async () => {
    renderPage();

    expect(await screen.findByText("AI 辅助写信")).toBeInTheDocument();
    expect(screen.getByText("直接套用模板")).toBeInTheDocument();
    expect(
      screen.getByText(
        "创建任务后，下一步通常是进入工作区生成草稿、人工检查，再决定立即发送或定时发送。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("模板润色")).not.toBeInTheDocument();
    expect(screen.queryByText("固定模板")).not.toBeInTheDocument();
  });
});
