import { useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Paperclip,
  RefreshCcw,
  Send,
  TimerReset,
} from 'lucide-react';
import { getTaskModeCopy } from '@/features/create-task/client/taskCopy';
import {
  MATERIAL_TYPE_LABELS,
  type IdentityMaterialDTO,
  type OutreachGenerationMode,
  type WorkspaceTaskSummaryDTO,
  type WorkspaceThreadDTO,
} from '@/types';

type WorkspaceComposerDockProps = {
  thread: WorkspaceThreadDTO;
  currentTask: WorkspaceTaskSummaryDTO;
  currentTaskMode: OutreachGenerationMode;
  draftReady: boolean;
  nextStepTitle: string;
  nextStepDescription: string;
  subject: string;
  content: string;
  hasRichHtml: boolean;
  selectedMaterialIds: number[];
  scheduledAt: string;
  acting: boolean;
  primaryMaterialOptions: IdentityMaterialDTO[];
  canChangePrimaryMaterial: boolean;
  canChangeMode: boolean;
  canCalculateMatch: boolean;
  canGenerateDraft: boolean;
  composerExpanded: boolean;
  onToggleExpanded: () => void;
  onSubjectChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSelectedMaterialIdsChange: (ids: number[]) => void;
  onScheduledAtChange: (value: string) => void;
  onSelectPrimaryMaterial: (materialId: number) => void;
  onSendNow: () => void;
  onScheduleSend: () => void;
  onCancelSchedule: () => void;
  onCalculateMatch: () => void;
  onGenerateDraft: () => void;
  onChangeMode: (value: OutreachGenerationMode) => void;
};

const MODE_OPTIONS: Array<{
  value: OutreachGenerationMode;
  label: string;
}> = [
  { value: 'llm', label: getTaskModeCopy('llm').title },
  { value: 'template', label: getTaskModeCopy('template').title },
];

const Panel = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className="rounded-[24px] border border-stone-200 bg-stone-50/70 px-4 py-4">
    <div className="text-sm font-semibold text-stone-900">{title}</div>
    {description ? (
      <div className="mt-1 text-xs leading-5 text-stone-500">{description}</div>
    ) : null}
    <div className="mt-3">{children}</div>
  </section>
);

const formatScheduleSummary = (value: string) => {
  if (!value) {
    return '未设置';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未设置';
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const WorkspaceComposerDock = ({
  thread,
  currentTask,
  currentTaskMode,
  draftReady,
  nextStepTitle,
  nextStepDescription,
  subject,
  content,
  hasRichHtml,
  selectedMaterialIds,
  scheduledAt,
  acting,
  primaryMaterialOptions,
  canChangePrimaryMaterial,
  canChangeMode,
  canCalculateMatch,
  canGenerateDraft,
  composerExpanded,
  onToggleExpanded,
  onSubjectChange,
  onContentChange,
  onSelectedMaterialIdsChange,
  onScheduledAtChange,
  onSelectPrimaryMaterial,
  onSendNow,
  onScheduleSend,
  onCancelSchedule,
  onCalculateMatch,
  onGenerateDraft,
  onChangeMode,
}: WorkspaceComposerDockProps) => {
  const attachmentNameMap = useMemo(
    () => new Map(thread.material_options.map((material) => [material.id, material.display_name])),
    [thread.material_options],
  );

  const selectedAttachmentNames = selectedMaterialIds
    .map((materialId) => attachmentNameMap.get(materialId))
    .filter((item): item is string => Boolean(item));

  const hasTemplateConfigured = Boolean(
    currentTask.outreach_template_body_text?.trim() || currentTask.outreach_template_body_html?.trim(),
  );
  const scheduledSummary = formatScheduleSummary(scheduledAt);
  const limitationHint =
    currentTaskMode === 'template'
      ? hasTemplateConfigured
        ? null
        : '固定模板还没准备好，先回身份页补模板。'
      : !hasTemplateConfigured
        ? '还没有套磁信模板，先回身份页补模板。'
        : currentTask.primary_material_id
          ? null
          : '还没有默认材料，先选一份可匹配的材料。';

  return (
    <div className="border-t border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,252,246,0.94),rgba(255,248,240,0.98))] px-4 py-4 backdrop-blur-xl sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        {composerExpanded ? (
          <div className="mb-4 rounded-[32px] border border-stone-200 bg-white/96 p-5 shadow-[0_24px_54px_-34px_rgba(41,37,36,0.3)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-stone-900">写信区</div>
                <div className="mt-1 text-xs leading-5 text-stone-500">
                  在这里整理草稿。上面的真实通信记录会一直保留，不会被打断。
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleExpanded}
                className="ui-btn-secondary shrink-0"
              >
                <ChevronDown className="h-4 w-4" />
                收起
              </button>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
                <label className="block">
                  <div className="mb-2 text-sm font-medium text-stone-800">邮件主题</div>
                  <input
                    value={subject}
                    onChange={(event) => onSubjectChange(event.target.value)}
                    className="form-input"
                    placeholder="给老师的邮件主题"
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-sm font-medium text-stone-800">邮件正文</div>
                  <textarea
                    value={content}
                    onChange={(event) => onContentChange(event.target.value)}
                    className="min-h-[320px] w-full rounded-[28px] border border-stone-200 bg-white px-4 py-4 text-sm leading-7 text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    placeholder="在这里继续修改草稿，或者直接手写。"
                  />
                </label>

                {hasRichHtml ? (
                  <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-6 text-stone-500">
                    当前这版会保留 HTML 格式发送；如果你手动改正文，系统会自动切回普通文本并重新生成基础 HTML。
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <Panel
                  title="草稿方式"
                  description="这里只放次要设置，不占主视线。"
                >
                  <div className="grid grid-cols-2 gap-2">
                    {MODE_OPTIONS.map((option) => {
                      const active = currentTaskMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={acting || !canChangeMode}
                          onClick={() => onChangeMode(option.value)}
                          className={clsx(
                            'rounded-2xl border px-3 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
                            active
                              ? 'border-primary bg-primary text-white'
                              : 'border-stone-200 bg-white text-stone-700 hover:border-primary/30 hover:bg-primary/5',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </Panel>

                <Panel
                  title="生成辅助"
                  description="需要时再用，不放在页面最显眼的位置。"
                >
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={acting || !canCalculateMatch}
                      onClick={onCalculateMatch}
                      className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      分析这位导师是否值得联系
                    </button>
                    <button
                      type="button"
                      disabled={acting || !canGenerateDraft}
                      onClick={onGenerateDraft}
                      className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      生成一版邮件草稿
                    </button>
                  </div>
                  {limitationHint ? (
                    <div className="mt-3 text-xs leading-5 text-stone-500">
                      {limitationHint}
                    </div>
                  ) : null}
                </Panel>

                <Panel title="发送设置">
                  <div className="space-y-3">
                    <label className="block">
                      <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-stone-400">
                        默认材料
                      </div>
                      <select
                        value={currentTask.primary_material_id ?? ''}
                        disabled={acting || !canChangePrimaryMaterial || primaryMaterialOptions.length === 0}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          if (Number.isFinite(nextValue)) {
                            onSelectPrimaryMaterial(nextValue);
                          }
                        }}
                        className="form-input"
                      >
                        <option value="">未选择</option>
                        {primaryMaterialOptions.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.display_name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-stone-400">
                        定时发送
                      </div>
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(event) => onScheduledAtChange(event.target.value)}
                        className="form-input"
                      />
                    </label>

                    <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-3 py-3 text-xs leading-6 text-stone-500">
                      当前计划：{scheduledSummary}
                    </div>
                  </div>
                </Panel>

                <Panel title="随信附件">
                  {thread.material_options.length === 0 ? (
                    <div className="text-sm text-stone-500">当前身份还没有可发送的材料。</div>
                  ) : (
                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                      {thread.material_options.map((material) => {
                        const checked = selectedMaterialIds.includes(material.id);
                        return (
                          <label
                            key={material.id}
                            className={clsx(
                              'flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-sm transition',
                              checked
                                ? 'border-primary/25 bg-primary/8 text-primary'
                                : 'border-stone-200 bg-white text-stone-700 hover:border-primary/25 hover:bg-primary/5',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  onSelectedMaterialIdsChange(
                                    checked
                                      ? selectedMaterialIds.filter((item) => item !== material.id)
                                      : [...selectedMaterialIds, material.id],
                                  );
                                }}
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {material.display_name}
                                </span>
                                <span className="mt-1 block text-xs text-stone-500">
                                  {MATERIAL_TYPE_LABELS[material.material_type]}
                                </span>
                              </span>
                            </span>
                            {checked ? <Check className="h-4 w-4 shrink-0" /> : null}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-stone-200 pt-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-1 text-xs text-stone-500">
                <div>
                  附件：{selectedAttachmentNames.length > 0 ? selectedAttachmentNames.join('、') : '未选择'}
                </div>
                <div>定时：{scheduledSummary}</div>
              </div>

              <div className="flex flex-wrap gap-3">
                {currentTask.status === 'scheduled' ? (
                  <button
                    type="button"
                    onClick={onCancelSchedule}
                    disabled={acting}
                    className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <TimerReset className="h-4 w-4" />
                    取消定时
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onScheduleSend}
                    disabled={acting || !content.trim() || !scheduledAt}
                    className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CalendarClock className="h-4 w-4" />
                    定时发送
                  </button>
                )}

                <button
                  type="button"
                  onClick={onSendNow}
                  disabled={acting || !content.trim()}
                  className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  立即发送
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-[28px] border border-stone-200 bg-white/94 px-4 py-4 shadow-[0_18px_40px_-34px_rgba(41,37,36,0.28)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-stone-900">
                {draftReady ? '继续写信' : '写第一封信'}
              </div>
              <div className="mt-1 text-xs leading-5 text-stone-500">
                {draftReady
                  ? '草稿已经准备好。点开后继续修改，再决定发送。'
                  : '编辑区默认收起，需要时再展开，不打断上面的沟通记录。'}
              </div>
              <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
                <div className="text-sm font-semibold text-stone-900">{nextStepTitle}</div>
                <div className="mt-1 text-xs leading-5 text-stone-600">{nextStepDescription}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-600">
                  {getTaskModeCopy(currentTaskMode).title}
                </span>
                <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-600">
                  <Paperclip className="mr-1 inline h-3.5 w-3.5" />
                  {selectedAttachmentNames.length > 0 ? `${selectedAttachmentNames.length} 份附件` : '未选附件'}
                </span>
                {scheduledAt ? (
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-600">
                    <CalendarClock className="mr-1 inline h-3.5 w-3.5" />
                    {scheduledSummary}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCalculateMatch}
                disabled={acting || !canCalculateMatch}
                className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw className="h-4 w-4" />
                分析这位导师是否值得联系
              </button>
              <button
                type="button"
                onClick={onGenerateDraft}
                disabled={acting || !canGenerateDraft}
                className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw className="h-4 w-4" />
                生成一版邮件草稿
              </button>
              <button
                type="button"
                onClick={onToggleExpanded}
                className="ui-btn-primary"
              >
                {composerExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
                {draftReady ? '编辑草稿' : '写信'}
              </button>
            </div>
          </div>

          {limitationHint ? (
            <div className="mt-3 text-xs leading-5 text-stone-500">{limitationHint}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
