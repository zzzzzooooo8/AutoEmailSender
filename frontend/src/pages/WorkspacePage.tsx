import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { WorkspaceComposerDock } from '@/components/organisms/WorkspaceComposerDock';
import { WorkspaceMessageThread } from '@/components/organisms/WorkspaceMessageThread';
import { WorkspaceSidebar } from '@/components/organisms/WorkspaceSidebar';
import { useSelectionContext } from '@/context/SelectionContext';
import {
  approveAndSchedule,
  approveAndSend,
  calculateMatch,
  cancelScheduledTask,
  generateDraft,
  updateTaskOutreachConfig,
  updateTaskPrimaryMaterial,
} from '@/lib/api/emailTasksApi';
import { ensureWorkspaceTask, getWorkspaceThread } from '@/lib/api/workspacesApi';
import { parseApiDateTime } from '@/lib/dateTime';
import {
  PROFESSOR_STATUS_LABELS,
  type IdentityMaterialDTO,
  type OutreachGenerationMode,
  type WorkspaceMessageDTO,
  type WorkspaceTaskSummaryDTO,
  type WorkspaceThreadDTO,
} from '@/types';

const PRIMARY_MATERIAL_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md'];

const WORKSPACE_STATUS_LABELS: Record<string, string> = {
  discovered: '待处理',
  matched: '已算匹配',
  draft_generated: '待确认',
  review_required: PROFESSOR_STATUS_LABELS.review_required,
  approved: '待发送',
  scheduled: PROFESSOR_STATUS_LABELS.scheduled,
  sent: PROFESSOR_STATUS_LABELS.sent,
  send_failed: PROFESSOR_STATUS_LABELS.send_failed,
  reply_detected: PROFESSOR_STATUS_LABELS.replied,
  skipped: PROFESSOR_STATUS_LABELS.skipped,
};

const getDefaultScheduledAtValue = () => {
  const local = new Date(Date.now() + 3600_000);
  local.setMinutes(Math.ceil(local.getMinutes() / 5) * 5);
  const adjusted = new Date(local.getTime() - local.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
};

const isPrimaryMaterialCandidate = (material: IdentityMaterialDTO) => {
  const filename = material.original_filename.toLowerCase();
  return PRIMARY_MATERIAL_EXTENSIONS.some((suffix) => filename.endsWith(suffix));
};

const getCurrentTaskOrNull = (
  thread: WorkspaceThreadDTO | null,
): WorkspaceTaskSummaryDTO | null =>
  thread?.current_task?.id != null ? thread.current_task : null;

const getLatestDraftMessage = (messages: WorkspaceMessageDTO[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].direction === 'draft') {
      return messages[index];
    }
  }
  return null;
};

const getStatusLabel = (currentTask: WorkspaceTaskSummaryDTO | null) => {
  if (!currentTask?.status) {
    return '尚未创建任务';
  }
  return WORKSPACE_STATUS_LABELS[currentTask.status] ?? currentTask.status;
};

export const WorkspacePage = () => {
  const { id } = useParams<{ id: string }>();
  const professorId = Number(id);
  const { selectedIdentityId, selectedLlmProfileId } = useSelectionContext();
  const [thread, setThread] = useState<WorkspaceThreadDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [contentHtml, setContentHtml] = useState<string | null>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const [scheduledAt, setScheduledAt] = useState(getDefaultScheduledAtValue);
  const [composerExpanded, setComposerExpanded] = useState(false);

  const syncComposer = useCallback((data: WorkspaceThreadDTO) => {
    const currentTask = getCurrentTaskOrNull(data);
    const latestDraftMessage = getLatestDraftMessage(data.messages);
    const preferredDraftMessage =
      currentTask?.status && !['sent', 'reply_detected'].includes(currentTask.status)
        ? latestDraftMessage
        : null;

    setSubject(
      currentTask?.approved_subject ??
        currentTask?.generated_subject ??
        preferredDraftMessage?.subject ??
        '',
    );
    setContent(
      currentTask?.approved_body_text ??
        currentTask?.generated_content_text ??
        preferredDraftMessage?.content ??
        '',
    );
    setContentHtml(
      currentTask?.approved_body_html ??
        currentTask?.generated_content_html ??
        preferredDraftMessage?.content_html ??
        null,
    );
    setSelectedMaterialIds(currentTask?.selected_material_ids ?? []);
    setScheduledAt(
      currentTask?.scheduled_at
        ? (() => {
            const scheduled = parseApiDateTime(currentTask.scheduled_at);
            const local = new Date(
              scheduled.getTime() - scheduled.getTimezoneOffset() * 60000,
            );
            return local.toISOString().slice(0, 16);
          })()
        : getDefaultScheduledAtValue(),
    );
  }, []);

  const loadThread = useCallback(async () => {
    if (!selectedIdentityId || !selectedLlmProfileId || !Number.isFinite(professorId)) {
      setThread(null);
      return;
    }

    setLoading(true);
    try {
      const data = await getWorkspaceThread(
        professorId,
        selectedIdentityId,
        selectedLlmProfileId,
      );
      const workspaceData =
        data.current_task.id == null
          ? await ensureWorkspaceTask(
              professorId,
              selectedIdentityId,
              selectedLlmProfileId,
            )
          : data;
      setThread(workspaceData);
      syncComposer(workspaceData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载工作区失败');
    } finally {
      setLoading(false);
    }
  }, [professorId, selectedIdentityId, selectedLlmProfileId, syncComposer]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    setComposerExpanded(false);
  }, [professorId, selectedIdentityId, selectedLlmProfileId]);

  const currentTask = getCurrentTaskOrNull(thread);
  const currentTaskId = currentTask?.id ?? null;
  const currentTaskMode = currentTask?.outreach_generation_mode ?? 'llm';
  const statusLabel = getStatusLabel(currentTask);
  const canChangePrimaryMaterial =
    currentTask?.id != null && !['sent', 'reply_detected'].includes(currentTask.status ?? '');
  const canChangeMode =
    currentTask?.id != null && !['sent', 'reply_detected'].includes(currentTask.status ?? '');
  const canCalculateMatch = Boolean(currentTaskId) && Boolean(currentTask?.primary_material_id);
  const hasTemplateConfigured = Boolean(
    currentTask?.outreach_template_body_text?.trim() ||
      currentTask?.outreach_template_body_html?.trim(),
  );
  const canGenerateDraft =
    Boolean(currentTaskId) &&
    (currentTaskMode === 'template'
      ? hasTemplateConfigured
      : hasTemplateConfigured && Boolean(currentTask?.primary_material_id));
  const primaryMaterialOptions = useMemo(
    () => (thread?.material_options ?? []).filter(isPrimaryMaterialCandidate),
    [thread?.material_options],
  );
  const realMessageCount = useMemo(
    () => thread?.messages.filter((message) => message.direction !== 'draft').length ?? 0,
    [thread?.messages],
  );

  const runAction = useCallback(
    async (
      action: () => Promise<WorkspaceThreadDTO>,
      fallbackMessage: string,
      onSuccess?: (data: WorkspaceThreadDTO) => void,
    ) => {
      setActing(true);
      try {
        const data = await action();
        setThread(data);
        syncComposer(data);
        setError(null);
        onSuccess?.(data);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : fallbackMessage);
      } finally {
        setActing(false);
      }
    },
    [syncComposer],
  );

  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    setContentHtml(null);
  }, []);

  const handleSendNow = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void runAction(
      () =>
        approveAndSend(currentTaskId, {
          subject: subject.trim() || null,
          body_text: content.trim(),
          body_html: contentHtml,
          selected_material_ids: selectedMaterialIds,
        }),
      '发送失败',
      () => setComposerExpanded(false),
    );
  }, [
    content,
    contentHtml,
    currentTaskId,
    runAction,
    selectedMaterialIds,
    subject,
  ]);

  const handleScheduleSend = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    const scheduleDate = new Date(scheduledAt);
    if (Number.isNaN(scheduleDate.getTime())) {
      setError('请先选一个有效的发送时间');
      return;
    }

    void runAction(
      () =>
        approveAndSchedule(currentTaskId, {
          subject: subject.trim() || null,
          body_text: content.trim(),
          body_html: contentHtml,
          selected_material_ids: selectedMaterialIds,
          scheduled_at: scheduleDate.toISOString(),
        }),
      '定时发送失败',
      () => setComposerExpanded(false),
    );
  }, [
    content,
    contentHtml,
    currentTaskId,
    runAction,
    scheduledAt,
    selectedMaterialIds,
    subject,
  ]);

  const handleCancelSchedule = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void runAction(() => cancelScheduledTask(currentTaskId), '取消定时失败');
  }, [currentTaskId, runAction]);

  const handleSelectPrimaryMaterial = useCallback(
    (materialId: number) => {
      if (!currentTaskId) {
        return;
      }

      void runAction(
        () => updateTaskPrimaryMaterial(currentTaskId, materialId),
        '切换默认材料失败',
      );
    },
    [currentTaskId, runAction],
  );

  const handleCalculateMatch = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void runAction(() => calculateMatch(currentTaskId), '计算匹配失败');
  }, [currentTaskId, runAction]);

  const handleGenerateDraft = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void runAction(
      () => generateDraft(currentTaskId),
      '生成草稿失败',
      () => setComposerExpanded(true),
    );
  }, [currentTaskId, runAction]);

  const handleChangeMode = useCallback(
    (nextMode: OutreachGenerationMode) => {
      if (!currentTaskId || nextMode === currentTaskMode) {
        return;
      }

      void runAction(
        () =>
          updateTaskOutreachConfig(currentTaskId, {
            outreach_generation_mode: nextMode,
          }),
        '切换模式失败',
      );
    },
    [currentTaskId, currentTaskMode, runAction],
  );

  if (!Number.isFinite(professorId)) {
    return <Navigate to="/404" replace />;
  }

  if (!selectedIdentityId || !selectedLlmProfileId) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-3xl border border-dashed border-stone-300 bg-[#fcfbf8] p-10 text-center">
          <h1 className="text-2xl font-semibold text-stone-900">先选择身份和模型</h1>
          <p className="mt-3 text-sm text-stone-600">工作区会跟随你当前的上下文。</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-center gap-2 rounded-[32px] border border-stone-200 bg-white px-6 py-16 text-sm text-stone-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在打开老师档案...
        </div>
      </main>
    );
  }

  if (!thread) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-[32px] border border-dashed border-stone-300 bg-white px-6 py-16 text-center text-sm text-stone-500 shadow-sm">
          {error ?? '未找到工作区数据'}
        </div>
      </main>
    );
  }

  const professorSummary =
    [thread.professor.university, thread.professor.school].filter(Boolean).join(' / ') ||
    '学校信息待补充';

  return (
    <main className="h-full min-h-0 overflow-hidden bg-[linear-gradient(180deg,rgba(255,250,243,0.92),rgba(255,255,255,0.98))]">
      <div className="mx-auto flex h-full min-h-0 max-w-[1440px] flex-col px-4 py-4 sm:px-6 sm:py-5">
        <header className="mb-4 shrink-0 rounded-[34px] border border-stone-200/80 bg-[radial-gradient(circle_at_top_right,rgba(153,27,27,0.08),transparent_28%),linear-gradient(180deg,rgba(255,248,240,0.98),rgba(255,255,255,0.98))] px-5 py-5 shadow-[0_20px_50px_-34px_rgba(41,37,36,0.28)] sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-[0.01em] text-stone-950">
                  {thread.professor.name}
                </h1>
                <span className="rounded-full border border-primary/15 bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-primary/20">
                  {statusLabel}
                </span>
              </div>
              <p className="mt-2 text-sm text-stone-500">
                {professorSummary}
                {thread.professor.title ? ` · ${thread.professor.title}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-xs font-medium text-stone-600">
                真实往来 {realMessageCount} 条
              </span>
              <span className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-xs font-medium text-stone-600">
                {currentTaskMode === 'template' ? '固定模板' : '模板润色'}
              </span>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="order-1 lg:order-2">
            <WorkspaceSidebar thread={thread} />
          </div>

          <section className="order-2 flex min-h-0 flex-col overflow-hidden rounded-[36px] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,252,247,0.98))] shadow-[0_24px_54px_-36px_rgba(41,37,36,0.34)] lg:order-1">
            {currentTask ? (
              <>
                <WorkspaceMessageThread messages={thread.messages} />

                <WorkspaceComposerDock
                  thread={thread}
                  currentTask={currentTask}
                  currentTaskMode={currentTaskMode}
                  subject={subject}
                  content={content}
                  hasRichHtml={Boolean(contentHtml)}
                  selectedMaterialIds={selectedMaterialIds}
                  scheduledAt={scheduledAt}
                  acting={acting}
                  error={error}
                  primaryMaterialOptions={primaryMaterialOptions}
                  canChangePrimaryMaterial={canChangePrimaryMaterial}
                  canChangeMode={canChangeMode}
                  canCalculateMatch={canCalculateMatch}
                  canGenerateDraft={canGenerateDraft}
                  composerExpanded={composerExpanded}
                  onToggleExpanded={() =>
                    setComposerExpanded((current) => !current)
                  }
                  onSubjectChange={setSubject}
                  onContentChange={handleContentChange}
                  onSelectedMaterialIdsChange={setSelectedMaterialIds}
                  onScheduledAtChange={setScheduledAt}
                  onSelectPrimaryMaterial={handleSelectPrimaryMaterial}
                  onSendNow={handleSendNow}
                  onScheduleSend={handleScheduleSend}
                  onCancelSchedule={handleCancelSchedule}
                  onCalculateMatch={handleCalculateMatch}
                  onGenerateDraft={handleGenerateDraft}
                  onChangeMode={handleChangeMode}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
                <div className="w-full max-w-2xl rounded-[30px] border border-dashed border-stone-300 bg-[linear-gradient(180deg,rgba(255,251,245,0.98),rgba(252,251,248,0.98))] px-6 py-12 text-center shadow-sm">
                  <div className="text-lg font-semibold text-stone-950">
                    这位老师还没有任务
                  </div>
                  <p className="mt-3 text-sm leading-7 text-stone-600">
                    请先从首页或任务页进入，系统会先为这位老师创建一条通信记录。
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};
