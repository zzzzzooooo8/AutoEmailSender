import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "@/pages/HomePage";
import type { IdentityDTO, LLMProfileDTO } from "@/types";

const mockedUseSelectionContext = vi.hoisted(() => vi.fn());
const mockedListProfessors = vi.hoisted(() => vi.fn());

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: mockedUseSelectionContext,
}));

vi.mock("@/lib/api/professorsApi", () => ({
  listProfessors: mockedListProfessors,
}));

vi.mock("@/lib/api/emailTasksApi", () => ({
  calculateMatch: vi.fn(),
}));

vi.mock("@/lib/api/workspacesApi", () => ({
  ensureWorkspaceTask: vi.fn(),
}));

vi.mock("@/lib/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(),
    dialog: null,
  }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({
    notifyError: vi.fn(),
    notifyWarning: vi.fn(),
  }),
}));

const selectedIdentity: IdentityDTO = {
  id: 1,
  name: "测试身份",
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
  outreach_template_subject: null,
  outreach_template_body_text: "",
  outreach_template_body_html: "",
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

const renderPage = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );

describe("HomePage onboarding", () => {
  beforeEach(() => {
    mockedListProfessors.mockReset();
    mockedListProfessors.mockResolvedValue([]);
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
      selectedIdentity,
      selectedLlmProfile,
      systemSettings: { mail_delivery_mode: "dry_run" },
    });
  });

  it("shows the onboarding checklist when the base setup is incomplete", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockedListProfessors).toHaveBeenCalledWith({
        identityId: 1,
        llmProfileId: 1,
      });
    });

    expect(
      await screen.findByRole("heading", { name: "开始使用前，还差这几步" }),
    ).toBeInTheDocument();
    expect(screen.getByText("创建发件身份")).toBeInTheDocument();
    expect(screen.getByText("配置 AI 模型")).toBeInTheDocument();
    expect(screen.getByText("准备材料和模板")).toBeInTheDocument();
    expect(screen.getByText("导入导师")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "继续完成准备" }),
    ).toBeInTheDocument();
  });
});
