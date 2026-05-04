import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IdentityDTO,
  LLMProfileDTO,
  ProfessorDashboardItemDTO,
  ProfessorManagementItemDTO,
} from "@/types";
import { HomePage } from "./HomePage";
import { ProfessorsPage } from "./ProfessorsPage";

const notifyMock = {
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
};

const selectedIdentity: IdentityDTO = {
  id: 1,
  name: "默认身份",
  profile_name: "Junie",
  sender_name: "Junie",
  email_address: "junie@example.com",
  smtp_host: "smtp.example.com",
  smtp_port: 465,
  smtp_username: "junie@example.com",
  smtp_password: "secret",
  imap_host: null,
  imap_port: null,
  imap_username: null,
  imap_password: null,
  default_language: "zh-CN",
  outreach_generation_mode: "llm",
  outreach_template_subject: "Hello",
  outreach_template_body_text: "Body",
  outreach_template_body_html: null,
  current_primary_material_id: 1,
  current_primary_material: null,
  match_threshold: null,
  daily_send_limit: null,
  send_interval_min: null,
  send_interval_max: null,
  same_domain_cooldown_minutes: null,
  is_default: true,
  materials: [],
  created_at: "2026-05-01T00:00:00",
  updated_at: "2026-05-01T00:00:00",
};

const selectedLlmProfile: LLMProfileDTO = {
  id: 1,
  name: "默认模型",
  provider: "openai",
  api_base_url: null,
  api_key: "secret",
  model_name: "gpt-5.4-mini",
  matcher_prompt_template: null,
  writer_prompt_template: null,
  temperature: null,
  max_tokens: null,
  is_default: true,
  created_at: "2026-05-01T00:00:00",
  updated_at: "2026-05-01T00:00:00",
};

const dashboardProfessors: ProfessorDashboardItemDTO[] = [
  {
    id: 11,
    name: "张明",
    email: "zhang@example.edu",
    title: "教授",
    university: "示例大学",
    school: "计算机学院",
    department: "人工智能系",
    research_direction: "自然语言处理",
    recent_papers: ["Paper A"],
    match_score: null,
    sent_count: 0,
    status: "not_contacted",
  },
  {
    id: 12,
    name: "李敏",
    email: "li@example.edu",
    title: "副教授",
    university: "示例大学",
    school: "软件学院",
    department: "软件工程系",
    research_direction: "软件工程",
    recent_papers: ["Paper B"],
    match_score: null,
    sent_count: 0,
    status: "ready_to_send",
  },
];

const managementProfessors: ProfessorManagementItemDTO[] =
  dashboardProfessors.map((professor) => ({
    ...professor,
    profile_url: null,
    source_url: null,
    crawl_status: "manual",
    skip_reason: null,
    archived_at: null,
    created_at: "2026-05-01T00:00:00",
    updated_at: "2026-05-01T00:00:00",
  }));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => notifyMock,
}));

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: () => ({
    identities: [selectedIdentity],
    llmProfiles: [selectedLlmProfile],
    selectedIdentityId: selectedIdentity.id,
    selectedLlmProfileId: selectedLlmProfile.id,
    selectedIdentity,
    selectedLlmProfile,
    loading: false,
    setSelectedIdentityId: vi.fn(),
    setSelectedLlmProfileId: vi.fn(),
    refreshSelections: vi.fn(),
  }),
}));

vi.mock("@/features/onboarding/client/getOnboardingState", () => ({
  getOnboardingState: () => ({
    completed: true,
    stage: "first_task",
    description: "",
    nextActionHref: "/",
  }),
}));

vi.mock("@/lib/api/professorsApi", () => ({
  archiveProfessor: vi.fn(),
  bulkArchiveProfessors: vi.fn(),
  createProfessor: vi.fn(),
  getProfessorTemplateDownloadUrl: vi.fn(),
  importProfessorsFromFile: vi.fn(),
  listProfessors: vi.fn(async () => dashboardProfessors),
  listProfessorsForManagement: vi.fn(async () => managementProfessors),
  restoreProfessor: vi.fn(),
  updateProfessor: vi.fn(),
}));

vi.mock("@/lib/api/crawlJobsApi", () => ({
  createCrawlJob: vi.fn(),
}));

vi.mock("@/lib/api/emailTasksApi", () => ({
  calculateMatch: vi.fn(),
}));

vi.mock("@/lib/api/workspacesApi", () => ({
  ensureWorkspaceTask: vi.fn(),
}));

describe("selection controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the home select-current-results action with the list selection area", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    const selectCurrentResults = await screen.findByRole("button", {
      name: "选择当前结果",
    });

    expect(
      screen.queryByRole("button", { name: "清空选择" }),
    ).not.toBeInTheDocument();

    fireEvent.click(selectCurrentResults);

    expect(
      await screen.findByText("已选中 2 位导师"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "清空选择" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "取消选择当前结果" }),
    );

    expect(screen.queryByText("已选中 2 位导师")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "清空选择" }),
    ).not.toBeInTheDocument();
  });

  it("moves the management select-current-page action into the selection column header", async () => {
    render(
      <MemoryRouter>
        <ProfessorsPage />
      </MemoryRouter>,
    );

    const tableHeader = await screen.findByTestId("professor-table-header");
    const selectCurrentPage = within(tableHeader).getByRole("button", {
      name: "选择当前页筛选结果",
    });

    expect(
      screen.queryByRole("button", { name: "清空选择" }),
    ).not.toBeInTheDocument();

    fireEvent.click(selectCurrentPage);

    expect(
      await screen.findByText("已选中 2 位导师"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "清空选择" }),
    ).toBeInTheDocument();
  });
});
