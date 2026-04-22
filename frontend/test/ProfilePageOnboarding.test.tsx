import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "@/pages/ProfilePage";
import type { IdentityDTO, LLMProfileDTO } from "@/types";

const mockedUseSelectionContext = vi.hoisted(() => vi.fn());

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: mockedUseSelectionContext,
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({
    notifyError: vi.fn(),
    notifyFormErrors: vi.fn(),
    notifySuccess: vi.fn(),
  }),
}));

vi.mock("@/lib/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(),
    dialog: null,
  }),
}));

vi.mock("@/lib/api/identities", () => ({
  createIdentity: vi.fn(),
  deleteIdentity: vi.fn(),
  importIdentityTemplate: vi.fn(),
  setDefaultIdentity: vi.fn(),
  testIdentityImap: vi.fn(),
  testIdentitySmtp: vi.fn(),
  updateIdentity: vi.fn(),
}));

vi.mock("@/lib/api/materials", () => ({
  deleteMaterial: vi.fn(),
  getMaterialDownloadUrl: vi.fn(),
  getMaterialOpenUrl: vi.fn(),
  setPrimaryMaterial: vi.fn(),
  uploadIdentityMaterial: vi.fn(),
}));

vi.mock("@/lib/api/llmProfiles", () => ({
  createLLMProfile: vi.fn(),
  deleteLLMProfile: vi.fn(),
  fetchLLMProfileModels: vi.fn(),
  setDefaultLLMProfile: vi.fn(),
  testLLMProfile: vi.fn(),
  updateLLMProfile: vi.fn(),
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
  outreach_generation_mode: "template",
  outreach_template_subject: "测试主题",
  outreach_template_body_text: "测试正文",
  outreach_template_body_html: "<p>测试正文</p>",
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
  api_base_url: "https://api.openai.com/v1",
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
      <ProfilePage />
    </MemoryRouter>,
  );

describe("ProfilePage onboarding", () => {
  beforeEach(() => {
    mockedUseSelectionContext.mockReturnValue({
      identities: [selectedIdentity],
      llmProfiles: [selectedLlmProfile],
      systemSettings: { mail_delivery_mode: "dry_run" },
      selectedIdentityId: selectedIdentity.id,
      selectedLlmProfileId: selectedLlmProfile.id,
      selectedIdentity,
      selectedLlmProfile,
      setSelectedIdentityId: vi.fn(),
      setSelectedLlmProfileId: vi.fn(),
      refreshSelections: vi.fn(),
      loading: false,
    });
  });

  it("shows the onboarding recommendation, sequence labels, and next-step hint", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "首次配置建议" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("建议顺序：先完成基础发送，再补充 AI 和回信检测"),
    ).toBeInTheDocument();
    expect(screen.getByText("1. 发件身份")).toBeInTheDocument();
    expect(screen.getByText("2. 材料与模板")).toBeInTheDocument();
    expect(screen.getByText("3. 模型配置")).toBeInTheDocument();
    expect(screen.getByText("4. 回信检测与高级设置")).toBeInTheDocument();
    expect(
      screen.getByText(
        "完成这部分后，下一步去「导师管理」导入第一批导师，再回首页开始创建任务。",
      ),
    ).toBeInTheDocument();
  });
});
