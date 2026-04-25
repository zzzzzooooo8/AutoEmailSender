import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceComposerDock } from "@/components/organisms/WorkspaceComposerDock";
import type {
  IdentityMaterialDTO,
  WorkspaceTaskSummaryDTO,
  WorkspaceThreadDTO,
} from "@/types";

const material: IdentityMaterialDTO = {
  id: 11,
  display_name: "简历.pdf",
  original_filename: "resume.pdf",
  mime_type: "application/pdf",
  size_bytes: 1024,
  material_type: "resume",
  is_primary: true,
  created_at: "2026-04-22T00:00:00Z",
};

const currentTask: WorkspaceTaskSummaryDTO = {
  id: 301,
  batch_task_id: 21,
  status: "matched",
  outreach_generation_mode: "llm",
  outreach_template_subject: "测试主题",
  outreach_template_body_text: "测试正文",
  outreach_template_body_html: null,
  match_score: 90,
  match_reason: null,
  fit_points: [],
  risk_points: [],
  match_keywords: [],
  generated_subject: null,
  generated_content_text: null,
  generated_content_html: null,
  approved_subject: null,
  approved_body_text: null,
  approved_body_html: null,
  primary_material_id: material.id,
  primary_material: material,
  selected_material_ids: [],
  approved_at: null,
  scheduled_at: null,
  last_send_attempt_at: null,
  sent_at: null,
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
};

const thread: WorkspaceThreadDTO = {
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
  material_options: [material],
  current_task: currentTask,
  messages: [],
};

describe("WorkspaceComposerDock copy", () => {
  it("shows the next-step prompt and goal-oriented action buttons", () => {
    render(
      <WorkspaceComposerDock
        thread={thread}
        currentTask={currentTask}
        currentTaskMode="llm"
        draftReady={false}
        subject=""
        content=""
        contentHtml=""
        selectedMaterialIds={[]}
        scheduledAt=""
        acting={false}
        primaryMaterialOptions={[material]}
        canChangePrimaryMaterial={true}
        canChangeMode={true}
        canCalculateMatch={true}
        canGenerateDraft={true}
        composerExpanded={false}
        nextStepTitle="生成邮件草稿"
        nextStepDescription="生成草稿后再人工检查。"
        onToggleExpanded={vi.fn()}
        onSubjectChange={vi.fn()}
        onContentChange={vi.fn()}
        onSelectedMaterialIdsChange={vi.fn()}
        onScheduledAtChange={vi.fn()}
        onSelectPrimaryMaterial={vi.fn()}
        onSendNow={vi.fn()}
        onScheduleSend={vi.fn()}
        onCancelSchedule={vi.fn()}
        onCalculateMatch={vi.fn()}
        onGenerateDraft={vi.fn()}
        onChangeMode={vi.fn()}
      />,
    );

    expect(screen.getByText("生成邮件草稿")).toBeInTheDocument();
    expect(screen.getByText("生成草稿后再人工检查。")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "分析匹配度" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "生成草稿" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "先看匹配" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成新草稿" })).not.toBeInTheDocument();
  });

  it("keeps send actions enabled for an HTML-only draft", () => {
    render(
      <WorkspaceComposerDock
        thread={thread}
        currentTask={currentTask}
        currentTaskMode="llm"
        draftReady={true}
        subject=""
        content=""
        contentHtml="<p>老师您好</p>"
        selectedMaterialIds={[]}
        scheduledAt="2026-04-22T18:30"
        acting={false}
        primaryMaterialOptions={[material]}
        canChangePrimaryMaterial={true}
        canChangeMode={true}
        canCalculateMatch={true}
        canGenerateDraft={true}
        composerExpanded={true}
        nextStepTitle="检查后发送"
        nextStepDescription="检查主题、正文和附件后发送。"
        onToggleExpanded={vi.fn()}
        onSubjectChange={vi.fn()}
        onContentChange={vi.fn()}
        onSelectedMaterialIdsChange={vi.fn()}
        onScheduledAtChange={vi.fn()}
        onSelectPrimaryMaterial={vi.fn()}
        onSendNow={vi.fn()}
        onScheduleSend={vi.fn()}
        onCancelSchedule={vi.fn()}
        onCalculateMatch={vi.fn()}
        onGenerateDraft={vi.fn()}
        onChangeMode={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "立即发送" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "定时发送" })).toBeEnabled();
  });

  it("renders a rich email editor for the draft body", () => {
    render(
      <WorkspaceComposerDock
        thread={thread}
        currentTask={currentTask}
        currentTaskMode="llm"
        draftReady={true}
        subject="测试主题"
        content="老师您好"
        contentHtml="<p>老师您好</p>"
        selectedMaterialIds={[]}
        scheduledAt=""
        acting={false}
        primaryMaterialOptions={[material]}
        canChangePrimaryMaterial={true}
        canChangeMode={true}
        canCalculateMatch={true}
        canGenerateDraft={true}
        composerExpanded={true}
        nextStepTitle="检查后发送"
        nextStepDescription="检查主题、正文和附件后发送。"
        onToggleExpanded={vi.fn()}
        onSubjectChange={vi.fn()}
        onContentChange={vi.fn()}
        onSelectedMaterialIdsChange={vi.fn()}
        onScheduledAtChange={vi.fn()}
        onSelectPrimaryMaterial={vi.fn()}
        onSendNow={vi.fn()}
        onScheduleSend={vi.fn()}
        onCancelSchedule={vi.fn()}
        onCalculateMatch={vi.fn()}
        onGenerateDraft={vi.fn()}
        onChangeMode={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "邮件正文" })).toHaveTextContent("老师您好");
    expect(screen.getByRole("textbox", { name: "邮件主题" })).toHaveTextContent("测试主题");
    expect(screen.getByRole("button", { name: "主题占位符菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "插入表格" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "HTML 预览" })).not.toBeInTheDocument();
  });

  it("organizes the expanded composer around an editing canvas and a sending rail", () => {
    render(
      <WorkspaceComposerDock
        thread={thread}
        currentTask={currentTask}
        currentTaskMode="llm"
        draftReady={true}
        subject="测试主题"
        content="老师您好"
        contentHtml="<p>老师您好</p>"
        selectedMaterialIds={[material.id]}
        scheduledAt="2026-04-22T18:30"
        acting={false}
        primaryMaterialOptions={[material]}
        canChangePrimaryMaterial={true}
        canChangeMode={true}
        canCalculateMatch={true}
        canGenerateDraft={true}
        composerExpanded={true}
        nextStepTitle="检查后发送"
        nextStepDescription="检查主题、正文和附件后发送。"
        onToggleExpanded={vi.fn()}
        onSubjectChange={vi.fn()}
        onContentChange={vi.fn()}
        onSelectedMaterialIdsChange={vi.fn()}
        onScheduledAtChange={vi.fn()}
        onSelectPrimaryMaterial={vi.fn()}
        onSendNow={vi.fn()}
        onScheduleSend={vi.fn()}
        onCancelSchedule={vi.fn()}
        onCalculateMatch={vi.fn()}
        onGenerateDraft={vi.fn()}
        onChangeMode={vi.fn()}
      />,
    );

    expect(screen.getByText("正文编辑")).toBeInTheDocument();
    expect(screen.getByText("发送前核对")).toBeInTheDocument();
    expect(screen.getByText("生成与模式")).toBeInTheDocument();
    expect(screen.getByText("发送动作")).toBeInTheDocument();
  });
});
