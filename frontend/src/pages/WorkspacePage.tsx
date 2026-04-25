import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { WorkspaceComposerDock } from '@/components/organisms/WorkspaceComposerDock';
import { WorkspaceMessageThread } from '@/components/organisms/WorkspaceMessageThread';
import { WorkspaceSidebar } from '@/components/organisms/WorkspaceSidebar';
import { useNotification } from '@/context/NotificationContext';
import { useSelectionContext } from '@/context/SelectionContext';
import { getTaskModeCopy } from '@/features/create-task/client/taskCopy';
import { getWorkspaceNextStep } from '@/features/workspace/client/getWorkspaceNextStep';
import {
  approveAndSchedule,
  approveAndSend,
  calculateMatch,
  cancelScheduledTask,
  continueManually,
  generateDraft,
  startFollowUp,
  updateTaskOutreachConfig,
  updateTaskPrimaryMaterial,
} from '@/lib/api/emailTasksApi';
import { ensureWorkspaceTask, getWorkspaceThread } from '@/lib/api/workspacesApi';
import { parseApiDateTime } from '@/lib/dateTime';
import { textToEmailHtml } from '@/lib/richEmail';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import {
  PROFESSOR_STATUS_LABELS,
  type IdentityMaterialDTO,
  type OutreachGenerationMode,
  type WorkspaceMessageDTO,
  type WorkspaceTaskStatusLabelKey,
  type WorkspaceTaskSummaryDTO,
  type WorkspaceThreadDTO,
} from '@/types';

const PRIMARY_MATERIAL_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md'];

const WORKSPACE_STATUS_LABELS: Record<WorkspaceTaskStatusLabelKey, string> = {
  discovered: '待处理',
  matched: '已算匹配',
  review_required: PROFESSOR_STATUS_LABELS.review_required,
  approved: '待发送',
  scheduled: PROFESSOR_STATUS_LABELS.scheduled,
  sent: PROFESSOR_STATUS_LABELS.sent,
  send_failed: PROFESSOR_STATUS_LABELS.send_failed,
  reply_detected: PROFESSOR_STATUS_LABELS.reply_detected,
  canceled: '已取消',
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

const shouldBlockDirectDraftActions = (task: WorkspaceTaskSummaryDTO | null) =>
  Boolean(
    task?.can_continue_manually ||
      task?.can_write_follow_up ||
      task?.status === 'canceled' ||
      task?.sent_at ||
      task?.is_replied,
  );

const getStatusLabel = (currentTask: WorkspaceTaskSummaryDTO | null) => {
  if (!currentTask?.status) {
    return '尚未创建任务';
  }
  return WORKSPACE_STATUS_LABELS[currentTask.status] ?? currentTask.status;
};

const getWorkspaceNextStepDescription = (title: string) => {
  switch (title) {
    case '作为单独联系继续':
      return '从这条批量任务记录中拆出一条单独联系继续推进。';
    case '写跟进邮件':
      return '基于当前沟通记录起草下一封跟进邮件。';
    case '查看失败原因并重试':
      return '检查失败原因，修正后重试。';
    case '选择分析材料':
      return '选择材料后可分析匹配度。';
    case '生成邮件草稿':
      return '生成草稿后再人工检查。';
    case '确认发送时间':
      return '确认发送时间，或改为立即发送。';
    default:
      return '检查主题、正文和附件后发送。';
  }
};

const deriveBodyTextFromDraft = ({
  content,
  contentHtml,
}: {
  content: string;
  contentHtml: string | null;
}) => {
  const trimmedContent = content.trim();
  if (trimmedContent) {
    return trimmedContent;
  }

  const trimmedHtml = contentHtml?.trim();
  if (!trimmedHtml) {
    return '';
  }
  const normalizedHtml = trimmedHtml
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');

  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(normalizedHtml, 'text/html');
    const text = document.body.textContent?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) {
      return text;
    }
  }

  return normalizedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};

export const WorkspacePage = () => {
  const { id } = useParams<{ id: string }>();
  const professorId = Number(id);
  const { notifyError, notifyFormErrors } = useNotification();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { selectedIdentityId, selectedLlmProfileId } = useSelectionContext();
  const [thread, setThread] = useState<WorkspaceThreadDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [contentHtml, setContentHtml] = useState<string | null>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const [scheduledAt, setScheduledAt] = useState(getDefaultScheduledAtValue);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const loadedThreadKeyRef = useRef<string | null>(null);
  const activeThreadRequestKeyRef = useRef<string | null>(null);
  const latestThreadRequestIdRef = useRef(0);
  const currentWorkspaceRequestKeyRef = useRef<string | null>(null);
  const latestActionRequestIdRef = useRef(0);
  const workspaceRequestKey =
    Number.isFinite(professorId) && selectedIdentityId && selectedLlmProfileId
      ? `${professorId}:${selectedIdentityId}:${selectedLlmProfileId}`
      : null;

  const syncComposer = useCallback((data: WorkspaceThreadDTO) => {
    const currentTask = getCurrentTaskOrNull(data);
    const blockedDraftActions = shouldBlockDirectDraftActions(currentTask);
    const latestDraftMessage = getLatestDraftMessage(data.messages);
    const preferredDraftMessage = blockedDraftActions ? null : latestDraftMessage;
    const nextSubject = blockedDraftActions
      ? ''
      : currentTask?.approved_subject ??
        currentTask?.generated_subject ??
        preferredDraftMessage?.subject ??
        '';
    const nextContentHtml = blockedDraftActions
      ? null
      : currentTask?.approved_body_html ??
        currentTask?.generated_content_html ??
        preferredDraftMessage?.content_html ??
        null;
    const nextContentText = deriveBodyTextFromDraft({
      content: blockedDraftActions
        ? ''
        : currentTask?.approved_body_text ??
          currentTask?.generated_content_text ??
          preferredDraftMessage?.content ??
          '',
      contentHtml: nextContentHtml,
    });

    setSubject(nextSubject);
    setContent(nextContentText);
    setContentHtml(nextContentHtml);
    setSelectedMaterialIds(blockedDraftActions ? [] : currentTask?.selected_material_ids ?? []);
    setScheduledAt(
      !blockedDraftActions && currentTask?.scheduled_at
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
    if (!workspaceRequestKey || !selectedIdentityId || !selectedLlmProfileId || !Number.isFinite(professorId)) {
      latestThreadRequestIdRef.current += 1;
      activeThreadRequestKeyRef.current = null;
      loadedThreadKeyRef.current = null;
      setThread(null);
      setLoadFailed(false);
      setLoading(false);
      return;
    }

    const requestId = latestThreadRequestIdRef.current + 1;
    latestThreadRequestIdRef.current = requestId;
    activeThreadRequestKeyRef.current = workspaceRequestKey;
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
      if (
        latestThreadRequestIdRef.current !== requestId ||
        activeThreadRequestKeyRef.current !== workspaceRequestKey
      ) {
        return;
      }
      setThread(workspaceData);
      setLoadFailed(false);
      syncComposer(workspaceData);
      loadedThreadKeyRef.current = workspaceRequestKey;
    } catch (loadError) {
      if (
        latestThreadRequestIdRef.current !== requestId ||
        activeThreadRequestKeyRef.current !== workspaceRequestKey
      ) {
        return;
      }
      const message = loadError instanceof Error ? loadError.message : '加载工作区失败';
      if (loadedThreadKeyRef.current !== workspaceRequestKey) {
        setThread(null);
        setLoadFailed(true);
      } else {
        setLoadFailed(false);
      }
      notifyError('加载工作区失败', message);
    } finally {
      if (
        latestThreadRequestIdRef.current === requestId &&
        activeThreadRequestKeyRef.current === workspaceRequestKey
      ) {
        setLoading(false);
      }
    }
  }, [notifyError, professorId, selectedIdentityId, selectedLlmProfileId, syncComposer, workspaceRequestKey]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    currentWorkspaceRequestKeyRef.current = workspaceRequestKey;
    latestActionRequestIdRef.current += 1;
    setActing(false);
  }, [workspaceRequestKey]);

  useEffect(() => {
    setComposerExpanded(false);
  }, [professorId, selectedIdentityId, selectedLlmProfileId]);

  const currentTask = getCurrentTaskOrNull(thread);
  const currentTaskId = currentTask?.id ?? null;
  const currentTaskMode = currentTask?.outreach_generation_mode ?? 'llm';
  const statusLabel = getStatusLabel(currentTask);
  const blocksDirectDraftActions = shouldBlockDirectDraftActions(currentTask);
  const canChangePrimaryMaterial =
    currentTask?.id != null && !blocksDirectDraftActions;
  const canChangeMode =
    currentTask?.id != null && !blocksDirectDraftActions;
  const canCalculateMatch =
    Boolean(currentTaskId) &&
    Boolean(currentTask?.primary_material_id) &&
    !blocksDirectDraftActions;
  const hasTemplateConfigured = Boolean(
    currentTask?.outreach_template_body_text?.trim() ||
      currentTask?.outreach_template_body_html?.trim(),
  );
  const canGenerateDraft =
    Boolean(currentTaskId) &&
    !blocksDirectDraftActions &&
    (currentTaskMode === 'template'
      ? hasTemplateConfigured
      : hasTemplateConfigured && Boolean(currentTask?.primary_material_id));
  const canSubmitDraft = Boolean(currentTaskId) && !blocksDirectDraftActions;
  const primaryMaterialOptions = useMemo(
    () => (thread?.material_options ?? []).filter(isPrimaryMaterialCandidate),
    [thread?.material_options],
  );
  const realMessageCount = useMemo(
    () => thread?.messages.filter((message) => message.direction !== 'draft').length ?? 0,
    [thread?.messages],
  );
  const preparedBodyText = deriveBodyTextFromDraft({ content, contentHtml });
  const hasDraft = Boolean(preparedBodyText);
  const nextStep = currentTask
    ? getWorkspaceNextStep({
        status: currentTask.status ?? 'discovered',
        hasDraft,
        hasPrimaryMaterial: Boolean(currentTask.primary_material_id),
        cancellationReason: currentTask.cancellation_reason,
        canContinueManually: currentTask.can_continue_manually,
        canWriteFollowUp: currentTask.can_write_follow_up,
      })
    : null;
  const nextStepDescription = nextStep ? getWorkspaceNextStepDescription(nextStep.title) : '';

  const runAction = useCallback(
    async (
      action: () => Promise<WorkspaceThreadDTO>,
      fallbackTitle: string,
      fallbackMessage: string,
      onSuccess?: (data: WorkspaceThreadDTO) => void,
    ) => {
      const actionRequestKey = workspaceRequestKey;
      const actionRequestId = latestActionRequestIdRef.current + 1;
      latestActionRequestIdRef.current = actionRequestId;
      setActing(true);
      try {
        const data = await action();
        if (
          latestActionRequestIdRef.current !== actionRequestId ||
          currentWorkspaceRequestKeyRef.current !== actionRequestKey
        ) {
          return;
        }
        setThread(data);
        setLoadFailed(false);
        syncComposer(data);
        onSuccess?.(data);
      } catch (actionError) {
        if (
          latestActionRequestIdRef.current !== actionRequestId ||
          currentWorkspaceRequestKeyRef.current !== actionRequestKey
        ) {
          return;
        }
        const message = actionError instanceof Error ? actionError.message : fallbackMessage;
        notifyError(fallbackTitle, message);
      } finally {
        if (
          latestActionRequestIdRef.current === actionRequestId &&
          currentWorkspaceRequestKeyRef.current === actionRequestKey
        ) {
          setActing(false);
        }
      }
    },
    [notifyError, syncComposer, workspaceRequestKey],
  );

  const handleContentChange = useCallback((value: { html: string; text: string }) => {
    setContent(value.text);
    setContentHtml(value.html);
  }, []);

  const handleSendNow = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void (async () => {
      const confirmed = await confirm({
        title: '确认立即发送这封真实邮件？',
        description: `将真实发给 ${thread?.professor.email ?? '当前导师邮箱'}，并附带 ${selectedMaterialIds.length} 份附件。`,
        confirmLabel: '确认发送',
        cancelLabel: '再检查一下',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }

      await runAction(
        () =>
          approveAndSend(currentTaskId, {
            subject: subject.trim() || null,
            body_text: preparedBodyText,
            body_html: contentHtml,
            selected_material_ids: selectedMaterialIds,
          }),
        '发送失败',
        '发送失败',
        () => setComposerExpanded(false),
      );
    })();
  }, [
    confirm,
    contentHtml,
    currentTaskId,
    preparedBodyText,
    runAction,
    selectedMaterialIds,
    subject,
    thread?.professor.email,
  ]);

  const handleScheduleSend = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    const scheduleDate = new Date(scheduledAt);
    if (Number.isNaN(scheduleDate.getTime())) {
      notifyFormErrors('请检查表单', ['请先选一个有效的发送时间']);
      return;
    }

    void (async () => {
      const confirmed = await confirm({
        title: '确认定时发送这封真实邮件？',
        description: `会在 ${scheduleDate.toLocaleString('zh-CN')} 自动发给 ${thread?.professor.email ?? '当前导师邮箱'}。`,
        confirmLabel: '确认定时',
        cancelLabel: '再检查一下',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }

      await runAction(
        () =>
          approveAndSchedule(currentTaskId, {
            subject: subject.trim() || null,
            body_text: preparedBodyText,
            body_html: contentHtml,
            selected_material_ids: selectedMaterialIds,
            scheduled_at: scheduleDate.toISOString(),
          }),
        '定时发送失败',
        '定时发送失败',
        () => setComposerExpanded(false),
      );
    })();
  }, [
    confirm,
    contentHtml,
    currentTaskId,
    notifyFormErrors,
    preparedBodyText,
    runAction,
    scheduledAt,
    selectedMaterialIds,
    subject,
    thread?.professor.email,
  ]);

  const handleCancelSchedule = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void runAction(() => cancelScheduledTask(currentTaskId), '取消定时失败', '取消定时失败');
  }, [currentTaskId, runAction]);

  const handleContinueManually = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void runAction(
      () => continueManually(currentTaskId),
      '继续联系失败',
      '继续联系失败',
      () => setComposerExpanded(true),
    );
  }, [currentTaskId, runAction]);

  const handleStartFollowUp = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void runAction(
      () => startFollowUp(currentTaskId),
      '创建跟进邮件失败',
      '创建跟进邮件失败',
      () => setComposerExpanded(true),
    );
  }, [currentTaskId, runAction]);

  const handleSelectPrimaryMaterial = useCallback(
    (materialId: number) => {
      if (!currentTaskId) {
        return;
      }

      void runAction(
        () => updateTaskPrimaryMaterial(currentTaskId, materialId),
        '切换默认材料失败',
        '切换默认材料失败',
      );
    },
    [currentTaskId, runAction],
  );

  const handleCalculateMatch = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void runAction(() => calculateMatch(currentTaskId), '计算匹配失败', '计算匹配失败');
  }, [currentTaskId, runAction]);

  const handleGenerateDraft = useCallback(() => {
    if (!currentTaskId) {
      return;
    }

    void runAction(
      () => generateDraft(currentTaskId),
      '生成草稿失败',
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
      <>
        <main className="mx-auto max-w-4xl px-6 py-10">
          <div className="rounded-3xl border border-dashed border-stone-300 bg-[#fcfbf8] p-10 text-center">
            <h1 className="text-2xl font-semibold text-stone-900">选择身份和模型</h1>
            <p className="mt-3 text-sm text-stone-600">工作区使用顶部选择的身份和模型。</p>
          </div>
        </main>
        {confirmDialog}
      </>
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
          {loadFailed ? '工作区数据暂时不可用，请返回上一页后重试。' : '未找到工作区数据'}
        </div>
      </main>
    );
  }

  const professorSummary =
    [thread.professor.university, thread.professor.school].filter(Boolean).join(' / ') ||
    '学校信息待补充';

  return (
    <>
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
                通信 {realMessageCount} 条
              </span>
              <span className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-xs font-medium text-stone-600">
                {getTaskModeCopy(currentTaskMode).title}
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
                  draftReady={hasDraft}
                  nextStepTitle={nextStep?.title ?? '继续整理沟通动作'}
                  nextStepDescription={nextStepDescription}
                  subject={subject}
                  content={content}
                  contentHtml={contentHtml || textToEmailHtml(content)}
                  selectedMaterialIds={selectedMaterialIds}
                  scheduledAt={scheduledAt}
                  acting={acting}
                  primaryMaterialOptions={primaryMaterialOptions}
                  canChangePrimaryMaterial={canChangePrimaryMaterial}
                  canChangeMode={canChangeMode}
                  canCalculateMatch={canCalculateMatch}
                  canGenerateDraft={canGenerateDraft}
                  canContinueManually={Boolean(currentTask.can_continue_manually)}
                  canStartFollowUp={Boolean(currentTask.can_write_follow_up)}
                  canSubmitDraft={canSubmitDraft}
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
                  onContinueManually={handleContinueManually}
                  onStartFollowUp={handleStartFollowUp}
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
                    从首页或任务页进入后，会自动创建通信记录。
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
        </div>
      </main>
      {confirmDialog}
    </>
  );
};
