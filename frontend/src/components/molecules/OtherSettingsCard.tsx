import { useCallback, useEffect, useMemo, useState, type TransitionEvent } from "react";
import clsx from "clsx";
import { ChevronDown, Loader2, Save, Settings } from "lucide-react";

import {
  defaultDraftRewritePreferences,
  getRuntimeSettings,
  updateRuntimeSettings,
  type RuntimeSettingsDTO,
  type RuntimeSettingsUpdateDTO,
} from "@/lib/api/runtimeSettings";

type RuntimeSettingsKey = keyof RuntimeSettingsUpdateDTO;
type NumberSettingsKey = {
  [Key in RuntimeSettingsKey]: RuntimeSettingsUpdateDTO[Key] extends number ? Key : never;
}[RuntimeSettingsKey];
type PreferenceSettingsKey = Exclude<RuntimeSettingsKey, NumberSettingsKey>;
type FormState = Record<RuntimeSettingsKey, string>;

const numberFields: Array<{
  key: NumberSettingsKey;
  label: string;
  hint: string;
  min: number;
  max: number;
  restartRequired?: boolean;
}> = [
  {
    key: "draft_max_tokens",
    label: "AI 草稿输出 token 上限",
    hint: "LLM 生成邮件草稿时传给模型的 max tokens，全局生效。",
    min: 256,
    max: 32000,
  },
  {
    key: "match_analysis_job_item_concurrency",
    label: "批量匹配分析并发数",
    hint: "单个批量匹配任务内同时分析的导师数量，保存后下一轮后端任务生效。",
    min: 1,
    max: 20,
  },
  {
    key: "match_analysis_job_interval_seconds",
    label: "批量匹配轮询间隔",
    hint: "后端检查待处理批量匹配任务的间隔秒数。",
    min: 1,
    max: 300,
    restartRequired: true,
  },
  {
    key: "match_analysis_job_worker_count",
    label: "批量匹配 Worker 数",
    hint: "同时处理的批量匹配任务数量。",
    min: 1,
    max: 8,
    restartRequired: true,
  },
  {
    key: "crawler_worker_count",
    label: "智能抓取任务并发数",
    hint: "同时运行的抓取任务数量。",
    min: 1,
    max: 8,
    restartRequired: true,
  },
  {
    key: "crawler_profile_enrichment_concurrency",
    label: "详情页补全并发数",
    hint: "单个抓取任务内同时补全的详情页数量，保存后下一轮抓取生效。",
    min: 1,
    max: 20,
  },
  {
    key: "crawler_host_concurrency",
    label: "同站点抓取并发数",
    hint: "同一域名同时抓取的详情页数量，建议保持 1。",
    min: 1,
    max: 8,
  },
];

const preferenceFields: Array<{
  key: PreferenceSettingsKey;
  label: string;
  hint: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    key: "draft_rewrite_intensity",
    label: "改写强度",
    hint: "控制 AI 对模板措辞的调整幅度。",
    options: [
      { value: "light", label: "轻微" },
      { value: "moderate", label: "中等" },
      { value: "strong", label: "明显" },
    ],
  },
  {
    key: "draft_rewrite_tone",
    label: "语气",
    hint: "控制邮件表达的沟通气质。",
    options: [
      { value: "polite", label: "礼貌" },
      { value: "professional", label: "专业" },
      { value: "friendly", label: "亲和" },
    ],
  },
  {
    key: "draft_rewrite_formality",
    label: "正式程度",
    hint: "控制句式接近自然表达还是正式学术邮件。",
    options: [
      { value: "natural", label: "更自然" },
      { value: "balanced", label: "默认" },
      { value: "formal", label: "更正式" },
    ],
  },
  {
    key: "draft_rewrite_length",
    label: "长度",
    hint: "控制 AI 是否压缩或展开模板内容。",
    options: [
      { value: "shorter", label: "更短" },
      { value: "default", label: "默认" },
      { value: "more_detailed", label: "更详细" },
    ],
  },
  {
    key: "draft_rewrite_specificity",
    label: "具体性",
    hint: "控制匹配理由的细节密度。",
    options: [
      { value: "concise", label: "概括" },
      { value: "balanced", label: "平衡" },
      { value: "detailed", label: "细节更足" },
    ],
  },
  {
    key: "draft_template_preservation",
    label: "模板保留度",
    hint: "控制 AI 对模板结构和主要话术的保留程度。",
    options: [
      { value: "structure_first", label: "优先保留结构" },
      { value: "balanced", label: "平衡" },
      { value: "content_first", label: "更重内容表达" },
    ],
  },
];

const emptyForm = [...numberFields, ...preferenceFields].reduce((state, field) => {
  state[field.key] = "";
  return state;
}, {} as FormState);

export function OtherSettingsCard() {
  const [open, setOpen] = useState(false);
  const [renderContent, setRenderContent] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await getRuntimeSettings();
      setForm(toFormState(settings));
      setUpdatedAt(settings.updated_at);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "加载其他设置失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || loading || updatedAt !== null || error) {
      return;
    }
    void loadSettings();
  }, [error, loadSettings, loading, open, updatedAt]);

  const summary = useMemo(() => {
    const matchConcurrency = form.match_analysis_job_item_concurrency || "3";
    const crawlConcurrency = form.crawler_profile_enrichment_concurrency || "3";
    const draftMaxTokens = form.draft_max_tokens || "3600";
    const draftMode =
      getPreferenceOptionLabel("draft_rewrite_intensity", form.draft_rewrite_intensity) || "默认";
    return `草稿 ${draftMaxTokens} / 偏好 ${draftMode} / 匹配 ${matchConcurrency} / 抓取 ${crawlConcurrency}`;
  }, [form]);

  const toggleOpen = () => {
    setOpen((current) => {
      const next = !current;
      if (next) {
        setRenderContent(true);
      }
      return next;
    });
  };

  const handleContentTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (open || event.propertyName !== "grid-template-rows") {
      return;
    }
    setRenderContent(false);
  };

  const handleChange = (key: RuntimeSettingsKey, value: string) => {
    setSavedMessage(null);
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const resetDraftPreferences = () => {
    setSavedMessage(null);
    setForm((current) => ({
      ...current,
      ...defaultDraftRewritePreferences,
    }));
  };

  const handleSubmit = async () => {
    const payload = toUpdatePayload(form);
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const saved = await updateRuntimeSettings(payload);
      setForm(toFormState(saved));
      setUpdatedAt(saved.updated_at);
      setSavedMessage("设置已保存");
    } catch (saveError) {
      setError(getErrorMessage(saveError, "保存其他设置失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="other-settings-card-content"
        onClick={toggleOpen}
        className="collapsible-card-toggle flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-stone-50 active:bg-stone-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-stone-900">其他设置</h2>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
              {summary}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            调整 AI 草稿 token 上限、改写偏好、批量匹配和智能抓取的并发限制。
          </p>
        </div>
        <ChevronDown
          className={clsx(
            "h-5 w-5 shrink-0 text-stone-500 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      {renderContent ? (
        <div
          id="other-settings-card-content"
          data-state={open ? "open" : "closed"}
          onTransitionEnd={handleContentTransitionEnd}
          className="collapsible-card-content"
        >
          <div className="min-h-0 px-6 pb-6">
            {loading ? (
              <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-8 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载其他设置...
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {numberFields.map((field) => (
                    <label
                      key={field.key}
                      className="block rounded-2xl border border-stone-200 bg-[#fcfbf8] px-4 py-4"
                    >
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-900">
                        <span>{field.label}</span>
                        {field.restartRequired ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            重启生效
                          </span>
                        ) : null}
                      </span>
                      <input
                        aria-label={field.label}
                        type="number"
                        min={field.min}
                        max={field.max}
                        value={form[field.key]}
                        onChange={(event) => handleChange(field.key, event.target.value)}
                        className="mt-3 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <span className="mt-2 block text-xs leading-5 text-stone-500">
                        {field.hint}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="space-y-4 border-t border-stone-200 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-stone-900">草稿改写偏好</h3>
                      <p className="mt-1 text-sm leading-6 text-stone-600">
                        调整 AI 润色模板时的表达方式。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetDraftPreferences}
                      className="ui-btn-secondary"
                    >
                      恢复草稿默认
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {preferenceFields.map((field) => (
                      <label
                        key={field.key}
                        className="block rounded-2xl border border-stone-200 bg-[#fcfbf8] px-4 py-4"
                      >
                        <span className="text-sm font-semibold text-stone-900">
                          {field.label}
                        </span>
                        <select
                          aria-label={field.label}
                          value={form[field.key]}
                          onChange={(event) => handleChange(field.key, event.target.value)}
                          className="mt-3 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        >
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="mt-2 block text-xs leading-5 text-stone-500">
                          {field.hint}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                    <h4 className="text-sm font-semibold text-stone-900">示例效果</h4>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      {buildDraftPreferencePreview(form)}
                    </p>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}
                {savedMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {savedMessage}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-stone-500">
                    <Settings className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      最后更新：{updatedAt ? new Date(updatedAt).toLocaleString("zh-CN") : "尚未加载"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={saving}
                    className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    保存设置
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function toFormState(settings: RuntimeSettingsDTO): FormState {
  const state = { ...emptyForm };
  for (const field of numberFields) {
    state[field.key] = String(settings[field.key]);
  }
  for (const field of preferenceFields) {
    state[field.key] = String(settings[field.key]);
  }
  return state;
}

function toUpdatePayload(form: FormState): RuntimeSettingsUpdateDTO {
  const payload = {} as RuntimeSettingsUpdateDTO;
  for (const field of numberFields) {
    const value = Number(form[field.key]);
    payload[field.key] = Number.isFinite(value) ? value : field.min;
  }
  for (const field of preferenceFields) {
    const defaultValue = defaultDraftRewritePreferences[field.key];
    const value = field.options.some((option) => option.value === form[field.key])
      ? form[field.key]
      : defaultValue;
    payload[field.key] = value as RuntimeSettingsUpdateDTO[typeof field.key];
  }
  return payload;
}

function getPreferenceOptionLabel(key: PreferenceSettingsKey, value: string): string | null {
  const field = preferenceFields.find((candidate) => candidate.key === key);
  return field?.options.find((option) => option.value === value)?.label ?? null;
}

function buildDraftPreferencePreview(form: FormState): string {
  const intensity = form.draft_rewrite_intensity;
  const tone = form.draft_rewrite_tone;
  const length = form.draft_rewrite_length;

  if (intensity === "strong" && tone === "professional") {
    return "更主动：我认真关注了您在人工智能方向的研究，尤其希望结合自己的项目经历，进一步了解课题组当前关注的问题。";
  }
  if (length === "shorter") {
    return "我关注到您的人工智能研究方向，希望有机会进一步交流。";
  }
  return "我对您在人工智能方向的研究很感兴趣，希望结合自己的经历，进一步了解课题组的研究机会。";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
