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
  delivery_mode: "dry_run",
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
  mail_delivery_mode: "dry_run",
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
        hasRichHtml={false}
        selectedMaterialIds={[]}
        scheduledAt=""
        acting={false}
        primaryMaterialOptions={[material]}
        canChangePrimaryMaterial={true}
        canChangeMode={true}
        canCalculateMatch={true}
        canGenerateDraft={true}
        composerExpanded={false}
        nextStepTitle="下一步：生成一版邮件草稿"
        nextStepDescription="先让系统起一版草稿，再人工检查是否保留这位导师。"
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

    expect(screen.getByText("下一步：生成一版邮件草稿")).toBeInTheDocument();
    expect(
      screen.getByText("先让系统起一版草稿，再人工检查是否保留这位导师。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "分析这位导师是否值得联系" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "生成一版邮件草稿" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "先看匹配" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成新草稿" })).not.toBeInTheDocument();
  });
});
