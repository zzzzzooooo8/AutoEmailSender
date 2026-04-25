import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOnboardingState } from "@/features/onboarding/client/getOnboardingState";
import { HomePage } from "@/pages/HomePage";
import type { IdentityDTO, LLMProfileDTO, ProfessorDashboardItemDTO } from "@/types";

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
  match_score: 92,
  sent_count: 0,
  status: "preparing",
};

const createProfessor = (
  id: number,
  name: string,
  status: ProfessorDashboardItemDTO["status"],
): ProfessorDashboardItemDTO => ({
  id,
  name,
  email: `${id}@example.com`,
  title: "教授",
  university: "测试大学",
  school: "计算机学院",
  department: "人工智能系",
  research_direction: "多智能体系统",
  recent_papers: [],
  match_score: 92,
  sent_count: 0,
  status,
});

const materialsStageDescription = getOnboardingState({
  hasIdentity: true,
  hasLlmProfile: true,
  hasPrimaryMaterial: false,
  hasProfessors: false,
  hasFirstTask: false,
}).description;

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
      selectedIdentity: createIdentity(),
      selectedLlmProfile,
    });
  });

  it("keeps the original loading state before the first professors load resolves", async () => {
    const deferred = createDeferred<ProfessorDashboardItemDTO[]>();
    mockedListProfessors.mockReturnValue(deferred.promise);
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
      selectedIdentity: createIdentity({
        current_primary_material_id: 11,
        outreach_template_body_text: "你好",
      }),
      selectedLlmProfile,
    });

    renderPage();

    await waitFor(() => {
      expect(mockedListProfessors).toHaveBeenCalledWith({
        identityId: 1,
        llmProfileId: 1,
      });
    });

    expect(screen.getByText("正在加载导师列表...")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "完成首次配置" }),
    ).not.toBeInTheDocument();

    deferred.resolve([professor]);
  });

  it("shows the materials onboarding stage and links to profile when materials or templates are missing", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", {
      name: "完成首次配置",
    });

    expect(heading).toBeInTheDocument();
    expect(screen.getByText(materialsStageDescription)).toBeInTheDocument();
    expect(screen.getByText("创建发件身份")).toBeInTheDocument();
    expect(screen.getByText("配置 AI 模型")).toBeInTheDocument();
    expect(screen.getByText("准备材料和模板")).toBeInTheDocument();
    expect(screen.getByText("导入导师")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "继续配置" })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("shows the onboarding card and links to professors when setup is complete but no professors exist", async () => {
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
      selectedIdentity: createIdentity({
        current_primary_material_id: 11,
        outreach_template_body_text: "老师您好",
      }),
      selectedLlmProfile,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "完成首次配置" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "继续配置" })).toHaveAttribute(
      "href",
      "/professors",
    );
  });

  it("stays on the dashboard when all onboarding prerequisites are satisfied", async () => {
    mockedListProfessors.mockResolvedValue([professor]);
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
      selectedIdentity: createIdentity({
        current_primary_material_id: 11,
        outreach_template_body_text: "老师您好",
      }),
      selectedLlmProfile,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "导师看板" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/模式：/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "完成首次配置" }),
    ).not.toBeInTheDocument();
  });

  it("shows relationship status labels and filter controls on the dashboard", async () => {
    mockedListProfessors.mockResolvedValue([professor]);
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
      selectedIdentity: createIdentity({
        current_primary_material_id: 11,
        outreach_template_body_text: "老师您好",
      }),
      selectedLlmProfile,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "导师看板" }),
    ).toBeInTheDocument();
    expect(screen.getByText("待写信")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "状态" })).toBeInTheDocument();
  });

  it("renders professors as a compact contact queue on the dashboard", async () => {
    mockedListProfessors.mockResolvedValue([professor]);
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
      selectedIdentity: createIdentity({
        current_primary_material_id: 11,
        outreach_template_body_text: "老师您好",
      }),
      selectedLlmProfile,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "导师看板" }),
    ).toBeInTheDocument();
    expect(screen.getByText("匹配 92%")).toBeInTheDocument();
    expect(screen.getByText("未发送")).toBeInTheDocument();
    expect(screen.getByText("待写信")).toBeInTheDocument();
    const selectButton = screen.getByRole("button", { name: "选择 王教授" });
    expect(selectButton).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(selectButton).toHaveClass("h-10", "w-10");
    expect(
      screen.queryByRole("checkbox", { name: "选择 王教授" }),
    ).not.toBeInTheDocument();
    const dashboardRow = screen.getByText("王教授").closest("article");
    expect(dashboardRow?.firstElementChild).toHaveClass("items-center");
    expect(screen.queryByText("匹配分数")).not.toBeInTheDocument();
    expect(screen.queryByText("发送次数")).not.toBeInTheDocument();
    expect(screen.queryByText("当前状态")).not.toBeInTheDocument();
  });

  it("renders six relationship filter options and filters the list through the UI", async () => {
    mockedListProfessors.mockResolvedValue([
      createProfessor(101, "未开始导师", "not_contacted"),
      createProfessor(102, "待写信导师", "preparing"),
      createProfessor(103, "待发送导师", "ready_to_send"),
      createProfessor(104, "已联系导师", "contacted"),
      createProfessor(105, "已回复导师", "replied"),
      createProfessor(106, "需处理导师", "needs_attention"),
    ]);
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
      selectedIdentity: createIdentity({
        current_primary_material_id: 11,
        outreach_template_body_text: "老师您好",
      }),
      selectedLlmProfile,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "导师看板" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("未开始导师")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "状态" }));

    expect(screen.getByRole("option", { name: "未开始" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "待写信" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "待发送" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "已联系" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "已回复" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "需处理" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "已联系" }));

    await waitFor(() => {
      expect(screen.getByText("已联系导师")).toBeInTheDocument();
      expect(screen.queryByText("未开始导师")).not.toBeInTheDocument();
      expect(screen.queryByText("待写信导师")).not.toBeInTheDocument();
      expect(screen.queryByText("待发送导师")).not.toBeInTheDocument();
      expect(screen.queryByText("已回复导师")).not.toBeInTheDocument();
      expect(screen.queryByText("需处理导师")).not.toBeInTheDocument();
    });
  });
});
