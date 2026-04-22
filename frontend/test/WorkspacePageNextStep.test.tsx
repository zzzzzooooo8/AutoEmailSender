import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacePage } from "@/pages/WorkspacePage";
import type {
  IdentityMaterialDTO,
  WorkspaceTaskStatus,
  WorkspaceThreadDTO,
} from "@/types";

const mockedUseSelectionContext = vi.hoisted(() => vi.fn());
const mockedGetWorkspaceThread = vi.hoisted(() => vi.fn());
const mockedEnsureWorkspaceTask = vi.hoisted(() => vi.fn());
const mockedWorkspaceComposerDock = vi.hoisted(() => vi.fn());

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: mockedUseSelectionContext,
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({
    notifyError: vi.fn(),
    notifyFormErrors: vi.fn(),
  }),
}));

vi.mock("@/lib/api/workspacesApi", () => ({
  getWorkspaceThread: mockedGetWorkspaceThread,
  ensureWorkspaceTask: mockedEnsureWorkspaceTask,
}));

vi.mock("@/lib/api/emailTasksApi", () => ({
  approveAndSchedule: vi.fn(),
  approveAndSend: vi.fn(),
  calculateMatch: vi.fn(),
  cancelScheduledTask: vi.fn(),
  generateDraft: vi.fn(),
  updateTaskOutreachConfig: vi.fn(),
  updateTaskPrimaryMaterial: vi.fn(),
}));

vi.mock("@/components/organisms/WorkspaceMessageThread", () => ({
  WorkspaceMessageThread: () => <div>mock-message-thread</div>,
}));

vi.mock("@/components/organisms/WorkspaceSidebar", () => ({
  WorkspaceSidebar: () => <div>mock-sidebar</div>,
}));

vi.mock("@/components/organisms/WorkspaceComposerDock", () => ({
  WorkspaceComposerDock: (props: {
    nextStepTitle: string;
    nextStepDescription: string;
    draftReady: boolean;
  }) => {
    mockedWorkspaceComposerDock(props);
    return (
      <div>
        <div>{props.nextStepTitle}</div>
        <div>{props.nextStepDescription}</div>
        <div>{props.draftReady ? "draft-ready" : "draft-empty"}</div>
      </div>
    );
  },
}));

const primaryMaterial: IdentityMaterialDTO = {
  id: 11,
  display_name: "简历.pdf",
  original_filename: "resume.pdf",
  mime_type: "application/pdf",
  size_bytes: 1024,
  material_type: "resume",
  is_primary: true,
  created_at: "2026-04-22T00:00:00Z",
};

const buildThread = ({
  status = "matched",
  primaryMaterialId = primaryMaterial.id,
  generatedSubject = null,
  generatedContentText = null,
  generatedContentHtml = null,
}: {
  status?: WorkspaceTaskStatus;
  primaryMaterialId?: number | null;
  generatedSubject?: string | null;
  generatedContentText?: string | null;
  generatedContentHtml?: string | null;
} = {}): WorkspaceThreadDTO => ({
  professor: {
    id: 101,
    name: "王教授",
    email: "prof@example.com",
    title: "教授",
    university: "测试大学",
    school: "计算机学院",
    research_direction: "多智能体系统",
  },
  identity: {
    id: 1,
    name: "测试身份",
    email_address: "sender@example.com",
  },
  llm_profile: {
    id: 1,
    name: "测试模型",
    provider: "openai",
    model_name: "gpt-test",
  },
  mail_delivery_mode: "dry_run",
  material_options: primaryMaterialId ? [primaryMaterial] : [],
  current_task: {
    id: 301,
    batch_task_id: 21,
    status,
    outreach_generation_mode: "llm",
    outreach_template_subject: "测试主题",
    outreach_template_body_text: "测试正文",
    outreach_template_body_html: null,
    match_score: 90,
    match_reason: null,
    fit_points: [],
    risk_points: [],
    match_keywords: [],
    generated_subject: generatedSubject,
    generated_content_text: generatedContentText,
    generated_content_html: generatedContentHtml,
    approved_subject: null,
    approved_body_text: null,
    approved_body_html: null,
    primary_material_id: primaryMaterialId,
    primary_material: primaryMaterialId ? primaryMaterial : null,
    selected_material_ids: [],
    delivery_mode: "dry_run",
    approved_at: null,
    scheduled_at: status === "scheduled" ? "2026-04-22T10:00:00Z" : null,
    last_send_attempt_at: null,
    sent_at: status === "sent" ? "2026-04-22T09:00:00Z" : null,
    last_rfc_message_id: null,
    retry_count: 0,
    last_error: null,
    is_replied: false,
    estimated_prompt_tokens: null,
    estimated_completion_tokens_upper_bound: null,
    estimated_total_tokens_upper_bound: null,
    last_draft_prompt_tokens: null,
    last_draft_completion_tokens: null,
    last_draft_total_tokens: null,
  },
  messages: [],
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/workspace/101"]}>
      <Routes>
        <Route path="/workspace/:id" element={<WorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("WorkspacePage next-step", () => {
  beforeEach(() => {
    mockedWorkspaceComposerDock.mockReset();
    mockedGetWorkspaceThread.mockReset();
    mockedEnsureWorkspaceTask.mockReset();
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
    });
  });

  it("treats an HTML-only draft as an existing draft instead of prompting to generate one", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(
      buildThread({
        generatedContentHtml: "<p>仅有 HTML 草稿</p>",
      }),
    );

    renderPage();

    expect(await screen.findByText("下一步：人工检查后发送")).toBeInTheDocument();
    expect(
      screen.getByText("草稿已经准备好，检查主题、正文和附件后，再决定立即发送还是定时发送。"),
    ).toBeInTheDocument();
    expect(screen.getByText("draft-ready")).toBeInTheDocument();
    expect(screen.queryByText("下一步：生成一版邮件草稿")).not.toBeInTheDocument();
  });

  it("prompts to select material first when no primary material is set", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(
      buildThread({
        primaryMaterialId: null,
      }),
    );

    renderPage();

    expect(await screen.findByText("下一步：先选择用于分析的材料")).toBeInTheDocument();
    expect(
      screen.getByText("先选一份材料，系统才能继续分析这位导师是否值得联系。"),
    ).toBeInTheDocument();
    expect(screen.getByText("draft-empty")).toBeInTheDocument();
  });

  it("keeps terminal status guidance ahead of missing-material or draft prompts", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(
      buildThread({
        status: "sent",
        primaryMaterialId: null,
      }),
    );

    renderPage();

    expect(await screen.findByText("下一步：查看发送结果")).toBeInTheDocument();
    expect(
      screen.getByText("邮件已经发出，接下来重点看发送结果，以及导师是否进入真实往来。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("下一步：先选择用于分析的材料")).not.toBeInTheDocument();
  });
});
