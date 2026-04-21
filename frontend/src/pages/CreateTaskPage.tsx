import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { NativeSelectField } from '@/components/atoms/NativeSelectField';
import { useNotification } from '@/context/NotificationContext';
import { createBatchTask } from '@/lib/api/batchTasksApi';
import { listProfessors } from '@/lib/api/professorsApi';
import { useSelectionContext } from '@/context/SelectionContext';
import {
  MATERIAL_TYPE_LABELS,
  type IdentityMaterialDTO,
  type OutreachGenerationMode,
  type ProfessorDashboardItemDTO,
} from '@/types';

const SESSION_KEY = 'selected_professor_ids';
const PRIMARY_MATERIAL_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md'];

const readSelectedProfessorIds = () => {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
};

const isPrimaryMaterialCandidate = (material: IdentityMaterialDTO) => {
  const filename = material.original_filename.toLowerCase();
  return PRIMARY_MATERIAL_EXTENSIONS.some((suffix) => filename.endsWith(suffix));
};

const MODE_OPTIONS: Array<{
  value: OutreachGenerationMode;
  title: string;
  description: string;
}> = [
  {
    value: 'llm',
    title: '模板润色',
    description: '必须先提供套磁信模板，AI 只会基于模板做小幅定制化润色。',
  },
  {
    value: 'template',
    title: '固定模板',
    description: '本次任务直接渲染模板变量，适合批量统一表达。',
  },
];

export const CreateTaskPage = () => {
  const navigate = useNavigate();
  const { notifyError, notifyFormErrors } = useNotification();
  const { selectedIdentityId, selectedLlmProfileId, selectedIdentity } = useSelectionContext();
  const [selectedProfessorIds] = useState<number[]>(readSelectedProfessorIds());
  const [professors, setProfessors] = useState<ProfessorDashboardItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [taskName, setTaskName] = useState(`批量任务 ${new Date().toLocaleDateString('zh-CN')}`);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [taskMode, setTaskMode] = useState<OutreachGenerationMode>('llm');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBodyText, setTemplateBodyText] = useState('');
  const [templateBodyHtml, setTemplateBodyHtml] = useState('');
  const [scheduleType, setScheduleType] = useState<'immediate' | 'scheduled'>('immediate');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [emailsPerWindow, setEmailsPerWindow] = useState('10');
  const [primaryMaterialId, setPrimaryMaterialId] = useState<number | null>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);

  useEffect(() => {
    const loadProfessors = async () => {
      if (!selectedIdentityId || !selectedLlmProfileId || selectedProfessorIds.length === 0) {
        setProfessors([]);
        return;
      }
      setLoading(true);
      try {
        const data = await listProfessors({
          identityId: selectedIdentityId,
          llmProfileId: selectedLlmProfileId,
          ids: selectedProfessorIds,
        });
        setProfessors(data);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : '加载已选导师失败';
        notifyError('加载已选导师失败', message);
      } finally {
        setLoading(false);
      }
    };

    void loadProfessors();
  }, [notifyError, selectedIdentityId, selectedLlmProfileId, selectedProfessorIds]);

  useEffect(() => {
    if (!selectedIdentity) {
      setPrimaryMaterialId(null);
      setSelectedMaterialIds([]);
      setTaskMode('llm');
      setSubject('');
      setBody('');
      setTemplateSubject('');
      setTemplateBodyText('');
      setTemplateBodyHtml('');
      return;
    }
    const nextPrimaryMaterialId =
      selectedIdentity.current_primary_material &&
      isPrimaryMaterialCandidate(selectedIdentity.current_primary_material)
        ? selectedIdentity.current_primary_material.id
        : null;
    setPrimaryMaterialId(nextPrimaryMaterialId);
    setSelectedMaterialIds([]);
    setTaskMode(selectedIdentity.outreach_generation_mode ?? 'llm');
    setSubject(selectedIdentity.outreach_template_subject ?? '');
    setBody(selectedIdentity.outreach_template_body_text ?? '');
    setTemplateSubject(selectedIdentity.outreach_template_subject ?? '');
    setTemplateBodyText(selectedIdentity.outreach_template_body_text ?? '');
    setTemplateBodyHtml(selectedIdentity.outreach_template_body_html ?? '');
  }, [selectedIdentity]);

  const primaryMaterialOptions = useMemo(
    () => (selectedIdentity ? selectedIdentity.materials.filter(isPrimaryMaterialCandidate) : []),
    [selectedIdentity],
  );

  const templateReady = Boolean(templateBodyText.trim() || templateBodyHtml.trim());

  const handleSubmit = async () => {
    const validationErrors: string[] = [];

    if (!selectedIdentityId || !selectedLlmProfileId) {
      validationErrors.push('请先选择身份和模型');
    }
    if (!taskName.trim()) {
      validationErrors.push('任务名称不能为空');
    }
    if (professors.length === 0) {
      validationErrors.push('当前没有可执行的导师');
    }
    if (scheduleType === 'scheduled' && (!startTime || !endTime || !emailsPerWindow)) {
      validationErrors.push('定时发送需要填写发送时间窗口和窗口内发送数量');
    }
    if (taskMode === 'template' && !templateReady) {
      validationErrors.push('固定模板模式至少需要填写纯文本正文或 HTML 正文');
    }
    if (taskMode === 'llm' && !body.trim()) {
      validationErrors.push('模板润色模式至少需要填写一份套磁信模板正文');
    }

    if (validationErrors.length > 0) {
      notifyFormErrors('请检查表单', validationErrors);
      return;
    }

    const identityId = selectedIdentityId;
    const llmProfileId = selectedLlmProfileId;

    if (!identityId || !llmProfileId) {
      return;
    }

    setSubmitting(true);
    try {
      const llmTemplateSubject = subject.trim() || null;
      const llmTemplateBodyText = body.trim() || null;
      const taskTemplateSubject =
        taskMode === 'llm' ? llmTemplateSubject : templateSubject.trim() || null;
      const taskTemplateBodyText =
        taskMode === 'llm' ? llmTemplateBodyText : templateBodyText.trim() || null;
      const taskTemplateBodyHtml = taskMode === 'template' ? templateBodyHtml.trim() || null : null;

      await createBatchTask({
        identity_id: identityId,
        llm_profile_id: llmProfileId,
        name: taskName.trim(),
        professor_ids: professors.map((item) => item.id),
        schedule_type: scheduleType,
        window_start_time: scheduleType === 'scheduled' ? startTime : null,
        window_end_time: scheduleType === 'scheduled' ? endTime : null,
        emails_per_window:
          scheduleType === 'scheduled' ? Number(emailsPerWindow || '0') || null : null,
        primary_material_id: primaryMaterialId,
        email_subject: llmTemplateSubject,
        email_body: llmTemplateBodyText,
        selected_material_ids: selectedMaterialIds.length ? selectedMaterialIds : null,
        outreach_generation_mode: taskMode,
        outreach_template_subject: taskTemplateSubject,
        outreach_template_body_text: taskTemplateBodyText,
        outreach_template_body_html: taskTemplateBodyHtml,
      });
      window.sessionStorage.removeItem(SESSION_KEY);
      navigate('/tasks');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '创建任务失败';
      notifyError('创建任务失败', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedIdentityId || !selectedLlmProfileId || !selectedIdentity) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-3xl border border-dashed border-stone-300 bg-[#fcfbf8] p-10 text-center">
          <h1 className="text-2xl font-semibold text-stone-900">先补齐上下文</h1>
          <p className="mt-3 text-sm text-stone-600">
            创建任务前，需要先在顶部选择身份与模型。
          </p>
        </div>
      </main>
    );
  }

  if (selectedProfessorIds.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-3xl border border-dashed border-stone-300 bg-[#fcfbf8] p-10 text-center">
          <h1 className="text-2xl font-semibold text-stone-900">还没有选中导师</h1>
          <p className="mt-3 text-sm text-stone-600">
            请先回到首页勾选目标导师，再进入批量任务创建页。
          </p>
          <Link to="/" data-interactive="button" className="ui-btn-primary mt-6">
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="rounded-3xl border border-stone-200 bg-[#fcfbf8] p-6 shadow-sm">
        <h1 className="text-3xl font-semibold text-stone-900">创建批量任务</h1>
        <p className="mt-2 text-sm text-stone-600">
          当前身份：{selectedIdentity.name}，本次将覆盖 {selectedProfessorIds.length} 位导师。
        </p>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-3xl border border-stone-200 bg-white px-6 py-14 text-sm text-stone-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载已选导师...
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr,0.85fr]">
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="space-y-6">
              <label className="block">
                <div className="mb-2 text-sm font-medium text-stone-800">任务名称</div>
                <input
                  value={taskName}
                  onChange={(event) => setTaskName(event.target.value)}
                  className="form-input"
                />
              </label>

              <div className="rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,248,240,0.72),rgba(255,255,255,0.96))] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-stone-900">本次发信模式</div>
                    <p className="mt-1 text-xs leading-6 text-stone-500">
                      身份页只提供默认值；这里决定这次任务真正使用的模式，并会快照进每位导师的任务里。
                    </p>
                  </div>
                  <span className="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-semibold text-primary">
                    任务级配置
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {MODE_OPTIONS.map((option) => {
                    const active = taskMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTaskMode(option.value)}
                        className={[
                          'rounded-[24px] border px-4 py-4 text-left transition',
                          active
                            ? 'border-primary bg-primary text-white shadow-[0_18px_30px_-22px_rgba(154,52,18,0.65)]'
                            : 'border-stone-200 bg-white text-stone-800 hover:border-primary/35 hover:bg-primary/5',
                        ].join(' ')}
                      >
                        <div className="text-sm font-semibold">{option.title}</div>
                        <div className={active ? 'mt-2 text-xs leading-6 text-white/80' : 'mt-2 text-xs leading-6 text-stone-500'}>
                          {option.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 text-xs leading-6 text-stone-500">
                  当前会一并快照模板内容；之后就算你改身份默认值，已创建任务也不会跟着漂移。
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <NativeSelectField
                  label="发送方式"
                  value={scheduleType}
                  onChange={(event) => setScheduleType(event.target.value as 'immediate' | 'scheduled')}
                >
                  <option value="immediate">立即发送</option>
                  <option value="scheduled">定时发送</option>
                </NativeSelectField>

                {scheduleType === 'scheduled' && (
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-stone-800">窗口内发送数量</div>
                    <input
                      type="number"
                      min="1"
                      value={emailsPerWindow}
                      onChange={(event) => setEmailsPerWindow(event.target.value)}
                      className="form-input"
                    />
                  </label>
                )}
              </div>

              <p className="text-sm leading-6 text-stone-500">
                {scheduleType === 'scheduled'
                  ? '定时发送：只在下面设置的时间窗口内发送，并按你填写的数量控制每个窗口的节奏。'
                  : '立即发送：任务准备好后就可以直接进入发送流。'}
              </p>

              {scheduleType === 'scheduled' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-stone-800">发送开始时间</div>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                      className="form-input"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-stone-800">发送结束时间</div>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                      className="form-input"
                    />
                  </label>
                </div>
              )}

              {taskMode === 'llm' ? (
                <div className="space-y-5 rounded-3xl border border-stone-200 bg-stone-50/80 p-4">
                  <div>
                    <div className="text-sm font-semibold text-stone-900">套磁信模板（必填）</div>
                    <p className="mt-1 text-xs leading-6 text-stone-500">
                      AI 只会在这份模板基础上做小幅润色，只改称呼、匹配理由、个性化一段、结尾和主题，不会重写整体结构。
                    </p>
                  </div>
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-stone-800">模板主题（可选）</div>
                    <input
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      placeholder="例如：申请与{{name}}老师交流科研方向"
                      className="form-input"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-stone-800">模板正文</div>
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="请粘贴你自己的套磁信模板，AI 会尽量保持整体结构和话术风格。"
                      className="min-h-40 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm text-stone-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-5 rounded-3xl border border-primary/15 bg-[linear-gradient(180deg,rgba(154,52,18,0.04),rgba(255,255,255,0.95))] p-4">
                  <div>
                    <div className="text-sm font-semibold text-stone-900">本次固定模板快照</div>
                    <p className="mt-1 text-xs leading-6 text-stone-500">
                      默认会带出身份页的默认模板。你现在改的是这次批量任务，不会反向改身份默认值。
                    </p>
                  </div>
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-stone-800">模板主题</div>
                    <input
                      value={templateSubject}
                      onChange={(event) => setTemplateSubject(event.target.value)}
                      placeholder="例如：申请与{{name}}老师交流科研方向"
                      className="form-input"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-stone-800">模板正文（纯文本）</div>
                    <textarea
                      value={templateBodyText}
                      onChange={(event) => setTemplateBodyText(event.target.value)}
                      placeholder="支持 {{name}}、{{university}}、{{sender_name}} 等占位符"
                      className="min-h-36 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm text-stone-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-stone-800">模板正文（HTML，可选）</div>
                    <textarea
                      value={templateBodyHtml}
                      onChange={(event) => setTemplateBodyHtml(event.target.value)}
                      placeholder="如果你需要保留格式，可以直接贴 HTML"
                      className="min-h-36 w-full rounded-2xl border border-stone-200 px-4 py-3 font-mono text-sm text-stone-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                </div>
              )}

              <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                <div className="text-sm font-medium text-stone-900">用于匹配的默认材料（可选）</div>
                <p className="mt-1 text-xs text-stone-500">留空也能创建任务，之后可在工作区手动选择并执行匹配。</p>
                {primaryMaterialOptions.length === 0 ? (
                  <p className="mt-3 text-sm text-stone-500">
                    当前没有可用于匹配的材料，但仍然可以先创建任务并手动写信发送。
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="primary-material"
                          checked={primaryMaterialId === null}
                          onChange={() => setPrimaryMaterialId(null)}
                        />
                        <span>暂不指定</span>
                      </span>
                      <span className="text-xs text-stone-500">匹配时再选</span>
                    </label>
                    {primaryMaterialOptions.map((material) => (
                      <label
                        key={material.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="primary-material"
                            checked={primaryMaterialId === material.id}
                            onChange={() => setPrimaryMaterialId(material.id)}
                          />
                          <span>{material.display_name}</span>
                        </span>
                        <span className="text-xs text-stone-500">
                          {MATERIAL_TYPE_LABELS[material.material_type]}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                <div className="text-sm font-medium text-stone-900">随信材料</div>
                <p className="mt-1 text-xs text-stone-500">这些材料会作为附件随邮件一起发送。</p>
                {selectedIdentity.materials.length === 0 ? (
                  <p className="mt-3 text-sm text-stone-500">当前身份还没有可选材料。</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {selectedIdentity.materials.map((material) => {
                      const checked = selectedMaterialIds.includes(material.id);
                      return (
                        <label
                          key={material.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
                        >
                          <span className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedMaterialIds((previous) =>
                                  previous.includes(material.id)
                                    ? previous.filter((item) => item !== material.id)
                                    : [...previous, material.id],
                                );
                              }}
                            />
                            <span>{material.display_name}</span>
                          </span>
                          <span className="text-xs text-stone-500">
                            {MATERIAL_TYPE_LABELS[material.material_type]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => navigate('/')} className="ui-btn-secondary">
                  返回首页
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                  className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  创建任务
                </button>
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">本次触达对象</h2>
            <div className="mt-4 space-y-3">
              {professors.map((professor) => (
                <div key={professor.id} className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                  <div className="font-medium text-stone-900">{professor.name}</div>
                  <div className="mt-1 text-sm text-stone-500">
                    {[professor.title, professor.university].filter(Boolean).join(' / ')}
                  </div>
                  <div className="mt-2 text-xs text-stone-500">
                    匹配分数：{professor.match_score === null ? '未计算' : `${professor.match_score}%`}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
};
