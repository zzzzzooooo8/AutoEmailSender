import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const mockedApproveAndSend = vi.hoisted(() => vi.fn());
const mockedApproveAndSchedule = vi.hoisted(() => vi.fn());
const mockedGenerateDraft = vi.hoisted(() => vi.fn());
const mockedConfirm = vi.hoisted(() => vi.fn());
const mockedNotificationApi = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifyFormErrors: vi.fn(),
}));

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: mockedUseSelectionContext,
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => mockedNotificationApi,
}));

vi.mock("@/lib/api/workspacesApi", () => ({
  getWorkspaceThread: mockedGetWorkspaceThread,
  ensureWorkspaceTask: mockedEnsureWorkspaceTask,
}));

vi.mock("@/lib/api/emailTasksApi", () => ({
  approveAndSchedule: mockedApproveAndSchedule,
  approveAndSend: mockedApproveAndSend,
  calculateMatch: vi.fn(),
  cancelScheduledTask: vi.fn(),
  generateDraft: mockedGenerateDraft,
  updateTaskOutreachConfig: vi.fn(),
  updateTaskPrimaryMaterial: vi.fn(),
}));

vi.mock("@/lib/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: mockedConfirm,
    dialog: null,
  }),
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
    subject: string;
    content: string;
    contentHtml: string;
    onContentChange: (value: { html: string; text: string }) => void;
    onGenerateDraft: () => void;
    onSendNow: () => void;
    onScheduleSend: () => void;
  }) => {
    mockedWorkspaceComposerDock(props);
    return (
      <div>
        <div>{props.nextStepTitle}</div>
        <div>{props.nextStepDescription}</div>
        <div>{props.draftReady ? "draft-ready" : "draft-empty"}</div>
        <div>{props.subject ? `draft-subject:${props.subject}` : "draft-subject-empty"}</div>
        <div>{props.content ? `draft-content:${props.content}` : "draft-content-empty"}</div>
        <div>{props.contentHtml ? `draft-html:${props.contentHtml}` : "draft-html-empty"}</div>
        <button type="button" onClick={props.onGenerateDraft}>
          mock-generate-draft
        </button>
        <button type="button" onClick={props.onSendNow}>
          mock-send-now
        </button>
        <button type="button" onClick={props.onScheduleSend}>
          mock-schedule-send
        </button>
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
    mockedApproveAndSend.mockReset();
    mockedApproveAndSchedule.mockReset();
    mockedGenerateDraft.mockReset();
    mockedConfirm.mockReset();
    mockedConfirm.mockResolvedValue(true);
    mockedApproveAndSend.mockImplementation(async () =>
      buildThread({
        generatedContentHtml: "<p>发送后的 HTML 草稿</p>",
      }),
    );
    mockedApproveAndSchedule.mockImplementation(async () =>
      buildThread({
        status: "scheduled",
        generatedContentHtml: "<p>定时后的 HTML 草稿</p>",
      }),
    );
    mockedGenerateDraft.mockImplementation(async () =>
      buildThread({
        status: "review_required",
        generatedSubject: "生成后的主题",
        generatedContentText: "生成后的正文",
        generatedContentHtml: "<p>生成后的正文</p>",
      }),
    );
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

    expect(await screen.findByText("检查后发送")).toBeInTheDocument();
    expect(screen.getByText("检查主题、正文和附件后发送。")).toBeInTheDocument();
    expect(screen.getByText("draft-ready")).toBeInTheDocument();
    expect(screen.queryByText("生成邮件草稿")).not.toBeInTheDocument();
  });

  it("shows readable draft content in the workspace for an HTML-only draft", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(
      buildThread({
        generatedContentHtml: "<p>老师您好</p><p>这里是 HTML 草稿正文。</p>",
      }),
    );

    renderPage();

    expect(
      await screen.findByText("draft-content:老师您好 这里是 HTML 草稿正文。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("draft-content-empty")).not.toBeInTheDocument();
  });

  it("does not treat a subject-only draft as ready to send", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(
      buildThread({
        generatedSubject: "只有主题",
      }),
    );

    renderPage();

    expect(await screen.findByText("生成邮件草稿")).toBeInTheDocument();
    expect(screen.getByText("生成草稿后再人工检查。")).toBeInTheDocument();
    expect(screen.getByText("draft-empty")).toBeInTheDocument();
    expect(screen.queryByText("检查后发送")).not.toBeInTheDocument();
  });

  it("passes the configured template into the composer before a draft is generated", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(buildThread());

    renderPage();

    expect(await screen.findByText("draft-subject:测试主题")).toBeInTheDocument();
    expect(screen.getByText("draft-content:测试正文")).toBeInTheDocument();
    expect(screen.getByText("draft-empty")).toBeInTheDocument();
  });

  it("shows the generated draft in the composer after clicking generate", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(buildThread());

    renderPage();

    await screen.findByText("draft-subject:测试主题");
    fireEvent.click(screen.getByRole("button", { name: "mock-generate-draft" }));

    await waitFor(() => {
      expect(mockedGenerateDraft).toHaveBeenCalledWith(301);
    });

    await waitFor(() => {
      expect(screen.getByText("draft-subject:生成后的主题")).toBeInTheDocument();
      expect(screen.getByText("draft-content:生成后的正文")).toBeInTheDocument();
      expect(screen.getByText("draft-html:<p>生成后的正文</p>")).toBeInTheDocument();
    });
  });

  it("prompts to select material first when no primary material is set", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(
      buildThread({
        primaryMaterialId: null,
      }),
    );

    renderPage();

    expect(await screen.findByText("选择分析材料")).toBeInTheDocument();
    expect(screen.getByText("选择材料后可分析匹配度。")).toBeInTheDocument();
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

    expect(await screen.findByText("查看发送结果")).toBeInTheDocument();
    expect(screen.getByText("关注发送结果和导师回复。")).toBeInTheDocument();
    expect(screen.queryByText("选择分析材料")).not.toBeInTheDocument();
  });

  it("fills a non-empty body_text when sending an HTML-only draft", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(
      buildThread({
        generatedContentHtml: "<p>老师您好</p><p>我想请教一个研究问题。</p>",
      }),
    );

    renderPage();

    await screen.findByText("检查后发送");

    fireEvent.click(screen.getByRole("button", { name: "mock-send-now" }));

    await waitFor(() => {
      expect(mockedConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "确认立即发送这封真实邮件？",
        }),
      );
      expect(mockedApproveAndSend).toHaveBeenCalledTimes(1);
    });

    expect(mockedApproveAndSend).toHaveBeenCalledWith(
      301,
      expect.objectContaining({
        body_html: "<p>老师您好</p><p>我想请教一个研究问题。</p>",
        body_text: expect.any(String),
      }),
    );

    const payload = mockedApproveAndSend.mock.calls[0][1] as { body_text: string };
    expect(payload.body_text.trim()).toBeTruthy();
    expect(payload.body_text).toContain("老师您好");
  });

  it("fills a non-empty body_text when scheduling an HTML-only draft", async () => {
    mockedGetWorkspaceThread.mockResolvedValue(
      buildThread({
        generatedContentHtml: "<p>老师您好</p><p>期待和您进一步交流。</p>",
      }),
    );

    renderPage();

    await screen.findByText("检查后发送");

    fireEvent.click(screen.getByRole("button", { name: "mock-schedule-send" }));

    await waitFor(() => {
      expect(mockedConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "确认定时发送这封真实邮件？",
        }),
      );
      expect(mockedApproveAndSchedule).toHaveBeenCalledTimes(1);
    });

    expect(mockedApproveAndSchedule).toHaveBeenCalledWith(
      301,
      expect.objectContaining({
        body_html: "<p>老师您好</p><p>期待和您进一步交流。</p>",
        body_text: expect.any(String),
        scheduled_at: expect.any(String),
      }),
    );

    const payload = mockedApproveAndSchedule.mock.calls[0][1] as { body_text: string };
    expect(payload.body_text.trim()).toBeTruthy();
    expect(payload.body_text).toContain("老师您好");
  });
});
