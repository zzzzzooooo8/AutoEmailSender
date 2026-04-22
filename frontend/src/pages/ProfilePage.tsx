import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  Plus,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useSelectionContext } from "@/context/SelectionContext";
import { NativeSelectField } from "@/components/atoms/NativeSelectField";
import { HtmlTemplateEditorField } from "@/components/molecules/HtmlTemplateEditorField";
import { formatApiDateTime } from "@/lib/dateTime";
import {
  createIdentity,
  deleteIdentity,
  importIdentityTemplate,
  setDefaultIdentity,
  testIdentityImap,
  testIdentitySmtp,
  updateIdentity,
} from "@/lib/api/identities";
import {
  deleteMaterial,
  getMaterialDownloadUrl,
  getMaterialOpenUrl,
  setPrimaryMaterial,
  uploadIdentityMaterial,
} from "@/lib/api/materials";
import {
  createLLMProfile,
  deleteLLMProfile,
  fetchLLMProfileModels,
  setDefaultLLMProfile,
  testLLMProfile,
  updateLLMProfile,
} from "@/lib/api/llmProfiles";
import {
  MAIL_DELIVERY_MODE_LABELS,
  MATERIAL_TYPE_LABELS,
  type IdentityDTO,
  type IdentityMaterialDTO,
  type IdentityMaterialType,
  type IdentityPayload,
  type LLMProfileDTO,
  type LLMProfileModelsResultDTO,
  type LLMProfilePayload,
  type LLMProfileTestResultDTO,
  type OutreachGenerationMode,
} from "@/types";
import { useConfirmDialog } from "@/lib/useConfirmDialog";

type IdentityFormState = {
  name: string;
  email_address: string;
  smtp_host: string;
  smtp_port: string;
  smtp_password: string;
  imap_host: string;
  imap_port: string;
  default_language: string;
  outreach_generation_mode: OutreachGenerationMode;
  outreach_template_subject: string;
  outreach_template_body_text: string;
  outreach_template_body_html: string;
  match_threshold: string;
  daily_send_limit: string;
  send_interval_min: string;
  send_interval_max: string;
  same_domain_cooldown_minutes: string;
  is_default: boolean;
};

type LLMFormState = {
  name: string;
  api_base_url: string;
  api_key: string;
  model_name: string;
  is_default: boolean;
};

type EditorId = number | "new" | null;
type ActionResultState = "idle" | "success" | "error";
type IdentityConnectionTestSummary = {
  kind: "smtp" | "imap";
  status: "success" | "error";
  message: string;
};

type MaterialFilterValue = IdentityMaterialType | "all";

const DEFAULT_LLM_PROVIDER = "openai";
const DEFAULT_LLM_TEMPERATURE = 0.2;
const DEFAULT_LLM_MAX_TOKENS = 1800;
const PRIMARY_MATERIAL_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt", ".md"];
const TEMPLATE_FILE_ACCEPT = ".docx,.html,.htm,.txt,.md";
const TEMPLATE_PLACEHOLDERS = [
  ["{{name}}", "导师姓名"],
  ["{{email}}", "导师邮箱"],
  ["{{title}}", "导师职称"],
  ["{{university}}", "导师学校"],
  ["{{school}}", "导师学院"],
  ["{{department}}", "导师院系"],
  ["{{research_direction}}", "导师研究方向"],
  ["{{sender_name}}", "你的身份名称"],
  ["{{sender_email}}", "你的发件邮箱"],
] as const;

const PROFILE_SETUP_STAGES = [
  "1. 发件身份",
  "2. 材料与模板",
  "3. 模型配置",
] as const;

const createEmptyIdentityForm = (): IdentityFormState => ({
  name: "",
  email_address: "",
  smtp_host: "",
  smtp_port: "465",
  smtp_password: "",
  imap_host: "",
  imap_port: "993",
  default_language: "zh-CN",
  outreach_generation_mode: "llm",
  outreach_template_subject: "",
  outreach_template_body_text: "",
  outreach_template_body_html: "",
  match_threshold: "",
  daily_send_limit: "",
  send_interval_min: "",
  send_interval_max: "",
  same_domain_cooldown_minutes: "",
  is_default: false,
});

const createEmptyLLMForm = (): LLMFormState => ({
  name: "",
  api_base_url: "",
  api_key: "",
  model_name: "",
  is_default: false,
});

const inferImapHost = (smtpHost: string) =>
  smtpHost.trim().replace(/smtp/gi, "imap");

const canUseAsPrimaryMaterial = (material: IdentityMaterialDTO) => {
  const filename = material.original_filename.toLowerCase();
  return PRIMARY_MATERIAL_EXTENSIONS.some((suffix) =>
    filename.endsWith(suffix),
  );
};

const shouldSyncImapHost = (smtpHost: string, imapHost: string) => {
  const trimmedImapHost = imapHost.trim();
  if (!trimmedImapHost) {
    return true;
  }
  return trimmedImapHost === inferImapHost(smtpHost);
};

const getTemplateValidationMessage = ({
  outreach_template_subject,
  outreach_template_body_text,
}: Pick<
  IdentityFormState,
  "outreach_template_subject" | "outreach_template_body_text"
>) => {
  const hasSubject = Boolean(outreach_template_subject.trim());
  const hasBodyText = Boolean(outreach_template_body_text.trim());

  if (!hasSubject && !hasBodyText) {
    return "请先填写默认套磁信主题和纯文本正文";
  }
  if (!hasSubject) {
    return "请先填写默认套磁信主题";
  }
  if (!hasBodyText) {
    return "请先填写默认套磁信纯文本正文";
  }
  return null;
};

const toIdentityForm = (identity: IdentityDTO): IdentityFormState => ({
  name: identity.name,
  email_address: identity.email_address,
  smtp_host: identity.smtp_host,
  smtp_port: String(identity.smtp_port),
  smtp_password: identity.smtp_password,
  imap_host: identity.imap_host ?? inferImapHost(identity.smtp_host),
  imap_port: identity.imap_port === null ? "" : String(identity.imap_port),
  default_language: identity.default_language,
  outreach_generation_mode: identity.outreach_generation_mode,
  outreach_template_subject: identity.outreach_template_subject ?? "",
  outreach_template_body_text: identity.outreach_template_body_text ?? "",
  outreach_template_body_html: identity.outreach_template_body_html ?? "",
  match_threshold:
    identity.match_threshold === null ? "" : String(identity.match_threshold),
  daily_send_limit:
    identity.daily_send_limit === null ? "" : String(identity.daily_send_limit),
  send_interval_min:
    identity.send_interval_min === null
      ? ""
      : String(identity.send_interval_min),
  send_interval_max:
    identity.send_interval_max === null
      ? ""
      : String(identity.send_interval_max),
  same_domain_cooldown_minutes:
    identity.same_domain_cooldown_minutes === null
      ? ""
      : String(identity.same_domain_cooldown_minutes),
  is_default: identity.is_default,
});

const toLLMForm = (profile: LLMProfileDTO): LLMFormState => ({
  name: profile.name,
  api_base_url: profile.api_base_url ?? "",
  api_key: profile.api_key,
  model_name: profile.model_name,
  is_default: profile.is_default,
});

const toIdentityPayload = (form: IdentityFormState): IdentityPayload => ({
  name: form.name.trim(),
  email_address: form.email_address.trim(),
  smtp_host: form.smtp_host.trim(),
  smtp_port: Number(form.smtp_port || "465"),
  smtp_username: form.email_address.trim(),
  smtp_password: form.smtp_password,
  imap_host: (form.imap_host.trim() || inferImapHost(form.smtp_host)).trim(),
  imap_port: Number(form.imap_port || "993"),
  imap_username: form.email_address.trim(),
  imap_password: form.smtp_password,
  default_language: form.default_language.trim() || "zh-CN",
  outreach_generation_mode: form.outreach_generation_mode,
  outreach_template_subject: form.outreach_template_subject.trim() || null,
  outreach_template_body_text: form.outreach_template_body_text.trim() || null,
  outreach_template_body_html: form.outreach_template_body_html.trim() || null,
  match_threshold: form.match_threshold ? Number(form.match_threshold) : null,
  daily_send_limit: form.daily_send_limit
    ? Number(form.daily_send_limit)
    : null,
  send_interval_min: form.send_interval_min
    ? Number(form.send_interval_min)
    : null,
  send_interval_max: form.send_interval_max
    ? Number(form.send_interval_max)
    : null,
  same_domain_cooldown_minutes: form.same_domain_cooldown_minutes
    ? Number(form.same_domain_cooldown_minutes)
    : null,
  is_default: form.is_default,
});

const toLLMPayload = (form: LLMFormState): LLMProfilePayload => ({
  name: form.name.trim(),
  provider: DEFAULT_LLM_PROVIDER,
  api_base_url: form.api_base_url.trim() || null,
  api_key: form.api_key.trim(),
  model_name: form.model_name.trim(),
  matcher_prompt_template: null,
  writer_prompt_template: null,
  temperature: DEFAULT_LLM_TEMPERATURE,
  max_tokens: DEFAULT_LLM_MAX_TOKENS,
  is_default: form.is_default,
});

const isExistingEditorId = (value: EditorId): value is number =>
  typeof value === "number";

const inputClassName =
  "w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

const labelClassName =
  "mb-2 inline-flex items-center gap-1 text-sm font-medium text-stone-800";

const renderFieldLabel = (label: string, required = false) => (
  <span className={labelClassName}>
    {required && <span className="text-base leading-none text-red-500">*</span>}
    <span>{label}</span>
  </span>
);

const formatFileSize = (sizeBytes: number) => {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

const openFileInNewTab = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

const triggerDownload = (url: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const formatDuration = (durationMs: number | null) =>
  durationMs === null ? "未返回" : `${durationMs} ms`;

const LlmModelsFeedbackPanel = ({
  result,
  currentModelName,
  onSelectModel,
}: {
  result: LLMProfileModelsResultDTO | null;
  currentModelName: string;
  onSelectModel: (modelName: string) => void;
}) => {
  const [searchKeyword, setSearchKeyword] = useState("");
  const deferredSearchKeyword = useDeferredValue(searchKeyword);

  if (!result) {
    return null;
  }

  const normalizedKeyword = deferredSearchKeyword.trim().toLowerCase();
  const filteredModels = result.models.filter((model) =>
    normalizedKeyword ? model.toLowerCase().includes(normalizedKeyword) : true,
  );
  const hasExactCurrentModel = result.models.includes(currentModelName.trim());

  return (
    <div
      className={clsx(
        "rounded-3xl border px-4 py-4 shadow-sm",
        result.ok
          ? "border-emerald-200 bg-emerald-50/80"
          : "border-red-200 bg-red-50/80",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-stone-900">基础连通性</span>
        <span
          className={clsx(
            "rounded-full px-2.5 py-1 text-[11px] font-medium",
            result.consumes_tokens
              ? "bg-amber-100 text-amber-700"
              : "bg-stone-900 text-white",
          )}
        >
          {result.consumes_tokens ? "会耗 token" : "不耗 token"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-stone-700">{result.message}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
          状态码：{result.status_code ?? "未返回"}
        </span>
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
          耗时：{formatDuration(result.duration_ms)}
        </span>
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
          端点：{result.endpoint_kind ?? "未识别"}
        </span>
      </div>
      {result.request_url ? (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white/90 px-3 py-2 text-xs leading-5 text-stone-600">
          <div className="font-medium text-stone-800">请求 URL</div>
          <div className="mt-1 break-all">{result.request_url}</div>
        </div>
      ) : null}
      {result.models.length > 0 ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-stone-700">可用模型</div>
            </div>
            <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-500">
              {filteredModels.length}/{result.models.length}
            </span>
          </div>
          <div className="mt-3 rounded-[24px] border border-stone-200 bg-white/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-sm text-stone-700 outline-none transition placeholder:text-stone-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
              placeholder="搜索模型名，点击进行选择"
            />
            {currentModelName.trim() ? (
              <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50/85 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                  当前选择
                </div>
                <div className="mt-2 break-all text-sm font-medium leading-6 text-stone-800">
                  {currentModelName}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  {hasExactCurrentModel ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                      已在列表中
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">
                      不在当前列表中
                    </span>
                  )}
                </div>
              </div>
            ) : null}
            <div className="mt-3 max-h-56 overflow-y-auto pr-1">
              {filteredModels.length > 0 ? (
                <div className="space-y-2">
                  {filteredModels.map((model) => {
                    const active = model === currentModelName.trim();
                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() => onSelectModel(model)}
                        className={clsx(
                          "group flex w-full justify-between items-center gap-3 rounded-2xl border px-3 py-2 text-left transition",
                          active
                            ? "border-primary/20 bg-primary text-white shadow-sm shadow-primary/20"
                            : "border-stone-200 bg-stone-50/75 text-stone-700 hover:border-stone-300 hover:bg-white hover:text-stone-900",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="break-all text-sm font-medium leading-5">
                            {model}
                          </div>
                        </div>
                        <div
                          className={clsx(
                            "mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
                            active
                              ? "bg-white/18 text-white"
                              : "bg-stone-100 text-stone-500 group-hover:bg-stone-200 group-hover:text-stone-700",
                          )}
                        >
                          {active ? "当前" : "选择"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/70 px-4 py-6 text-center text-xs text-stone-500">
                  没找到匹配的模型名，试试换个关键词。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const LlmTestFeedbackPanel = ({
  result,
}: {
  result: LLMProfileTestResultDTO | null;
}) => {
  if (!result) {
    return null;
  }

  return (
    <div
      className={clsx(
        "rounded-3xl border px-4 py-4 shadow-sm",
        result.ok
          ? "border-emerald-200 bg-emerald-50/80"
          : "border-red-200 bg-red-50/80",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-stone-900">测试模型</span>
        <span
          className={clsx(
            "rounded-full px-2.5 py-1 text-[11px] font-medium",
            result.consumes_tokens
              ? "bg-amber-100 text-amber-700"
              : "bg-stone-900 text-white",
          )}
        >
          {result.consumes_tokens ? "会耗 token" : "不耗 token"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-stone-700">{result.message}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
          状态码：{result.status_code ?? "未返回"}
        </span>
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
          耗时：{formatDuration(result.duration_ms)}
        </span>
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
          端点：{result.endpoint_kind ?? "未识别"}
        </span>
      </div>
      {result.request_url ? (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white/90 px-3 py-2 text-xs leading-5 text-stone-600">
          <div className="font-medium text-stone-800">最终请求 URL</div>
          <div className="mt-1 break-all">{result.request_url}</div>
        </div>
      ) : null}
      {result.attempted_urls.length > 1 ? (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white/90 px-3 py-2 text-xs leading-5 text-stone-600">
          <div className="font-medium text-stone-800">尝试过的 URL</div>
          <div className="mt-1 break-all">
            {result.attempted_urls.join("\n")}
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
          输入 token：{result.prompt_tokens ?? "未返回"}
        </span>
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
          输出 token：{result.completion_tokens ?? "未返回"}
        </span>
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
          总 token：{result.total_tokens ?? "未返回"}
        </span>
      </div>
      {result.response_preview ? (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white/90 px-3 py-2 text-xs leading-5 text-stone-600">
          <div className="font-medium text-stone-800">响应预览</div>
          <div className="mt-1 whitespace-pre-wrap">
            {result.response_preview}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const MATERIAL_TYPE_OPTIONS = Object.entries(MATERIAL_TYPE_LABELS) as [
  IdentityMaterialType,
  string,
][];

const getMaterialTypeLabel = (value: IdentityMaterialType) =>
  MATERIAL_TYPE_LABELS[value];

const getActionButtonClassName = (state: ActionResultState, loading: boolean) =>
  clsx(
    "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
    state === "success" &&
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/80",
    state === "error" &&
      "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100/80",
    state === "idle" &&
      "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900",
    loading && "cursor-not-allowed opacity-70",
  );

type EditorOption = {
  id: number;
  name: string;
  is_default: boolean;
};

type EditorSwitcherProps = {
  label: string;
  helper?: string;
  options: EditorOption[];
  activeId: EditorId;
  createLabel: string;
  creatingLabel: string;
  onCreate: () => void;
  onSelect: (id: number) => void;
};

const EditorSwitcher = ({
  label,
  helper,
  options,
  activeId,
  createLabel,
  creatingLabel,
  onCreate,
  onSelect,
}: EditorSwitcherProps) => (
  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm shadow-stone-100/60">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-stone-900">{label}</div>
        {helper ? (
          <p className="mt-1 text-xs leading-5 text-stone-500">{helper}</p>
        ) : null}
      </div>
      {options.length > 0 ? (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-white hover:text-stone-900"
        >
          <Plus className="h-4 w-4" />
          {createLabel}
        </button>
      ) : null}
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      {options.length === 0 ? (
        <div className="w-full rounded-2xl border border-dashed border-primary/20 bg-primary/5 px-4 py-4">
          <div className="text-sm font-medium text-primary">
            {creatingLabel}
          </div>
        </div>
      ) : (
        options.map((option) => {
          const isActive = activeId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-all",
                isActive
                  ? "border-primary/20 bg-primary text-white shadow-sm shadow-primary/20"
                  : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-white hover:text-stone-900",
              )}
            >
              <span>{option.name}</span>
              {option.is_default && (
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    isActive
                      ? "bg-white/18 text-white"
                      : "bg-white text-stone-500",
                  )}
                >
                  默认
                </span>
              )}
            </button>
          );
        })
      )}

      {options.length > 0 && activeId === "new" && (
        <div className="inline-flex items-center rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
          {creatingLabel}
        </div>
      )}
    </div>
  </div>
);

const MaterialTypePicker = ({
  value,
  onChange,
}: {
  value: IdentityMaterialType;
  onChange: (value: IdentityMaterialType) => void;
}) => (
  <NativeSelectField
    value={value}
    onChange={(event) => onChange(event.target.value as IdentityMaterialType)}
    wrapperClassName="w-full max-w-xs"
    shellClassName="min-h-10 rounded-2xl border-stone-200 bg-white/92 px-4 py-2.5 shadow-sm shadow-stone-100/70"
  >
    {MATERIAL_TYPE_OPTIONS.map(([type, label]) => (
      <option key={type} value={type}>
        {label}
      </option>
    ))}
  </NativeSelectField>
);

const MaterialFilterBar = ({
  value,
  materials,
  onChange,
}: {
  value: MaterialFilterValue;
  materials: IdentityMaterialDTO[];
  onChange: (value: MaterialFilterValue) => void;
}) => (
  <div className="flex flex-wrap gap-2">
    <button
      type="button"
      onClick={() => onChange("all")}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
        value === "all"
          ? "border-stone-900 bg-stone-900 text-white shadow-sm shadow-stone-900/20"
          : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900",
      )}
    >
      全部 {materials.length}
    </button>
    {MATERIAL_TYPE_OPTIONS.map(([type, label]) => {
      const count = materials.filter(
        (material) => material.material_type === type,
      ).length;
      if (!count) {
        return null;
      }
      return (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={clsx(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition",
            value === type
              ? "border-primary bg-primary text-white shadow-sm shadow-primary/20"
              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900",
          )}
        >
          {label} {count}
        </button>
      );
    })}
  </div>
);

const MaterialSummaryCard = ({
  identity,
  onOpen,
}: {
  identity: IdentityDTO;
  onOpen: () => void;
}) => {
  const primaryMaterial = identity.current_primary_material;

  return (
    <div className="rounded-[28px] border border-stone-200 bg-[linear-gradient(135deg,#fffdfa,#fff8ef_55%,#fff3e1)] p-5 shadow-sm shadow-stone-200/70">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-stone-900">材料库</div>
            <div className="mt-1 text-xs text-stone-500">
              共 {identity.materials.length} 份
              {primaryMaterial
                ? ` · 默认材料：${primaryMaterial.display_name}`
                : " · 当前未设默认材料"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {MATERIAL_TYPE_OPTIONS.map(([type, label]) => {
              const count = identity.materials.filter(
                (material) => material.material_type === type,
              ).length;
              if (!count) {
                return null;
              }
              return (
                <span
                  key={type}
                  className="rounded-full border border-stone-200/80 bg-white/90 px-3 py-1 text-xs text-stone-600"
                >
                  {label} {count}
                </span>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-2 rounded-2xl border border-stone-300 bg-white/95 px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-white"
        >
          <FolderOpen className="h-4 w-4" />
          打开材料库
        </button>
      </div>
    </div>
  );
};

const IdentityConnectionCard = ({
  testingIdentityConnection,
  lastResult,
  onTestSmtp,
  onTestImap,
}: {
  testingIdentityConnection: "smtp" | "imap" | null;
  lastResult: IdentityConnectionTestSummary | null;
  onTestSmtp: () => void;
  onTestImap: () => void;
}) => (
  <div className="rounded-[28px] border border-stone-200 bg-[linear-gradient(135deg,#fffdfa,#fff9f2_52%,#fff5ea)] p-5 shadow-sm shadow-stone-200/70">
    <div className="flex flex-wrap justify-between items-center gap-4">
      <div className="space-y-2">
        <div className="text-sm font-medium text-stone-900">邮箱连接测试</div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onTestSmtp}
          disabled={testingIdentityConnection !== null}
          className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {testingIdentityConnection === "smtp" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          测试 SMTP
        </button>
        <button
          type="button"
          onClick={onTestImap}
          disabled={testingIdentityConnection !== null}
          className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {testingIdentityConnection === "imap" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          测试 IMAP
        </button>
      </div>
    </div>
    {lastResult ? (
      <div className="mt-4 rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-3 text-sm text-stone-700">
        <div className="font-medium text-stone-900">
          上次测试：{lastResult.kind.toUpperCase()}
          {lastResult.status === "success" ? " 成功" : " 失败"}
        </div>
        <div className="mt-1 whitespace-pre-wrap break-words text-stone-600">
          {lastResult.message}
        </div>
      </div>
    ) : null}
  </div>
);

const OutreachTemplateSummaryCard = ({
  form,
  onOpen,
}: {
  form: IdentityFormState;
  onOpen: () => void;
}) => {
  const hasSubject = Boolean(form.outreach_template_subject.trim());
  const hasTextTemplate = Boolean(form.outreach_template_body_text.trim());
  const hasHtmlTemplate = Boolean(form.outreach_template_body_html.trim());

  return (
    <div className="rounded-[28px] border border-stone-200 bg-[linear-gradient(135deg,#fffdfa,#fff7ee_58%,#fff2e4)] p-5 shadow-sm shadow-stone-200/70">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-stone-900">
              默认发信模式与默认模板
            </div>
            <div className="mt-1 text-xs leading-6 text-stone-500">
              这里设置新任务默认采用的生成路径，以及共用的一套模板字段。当前默认模式：
              {form.outreach_generation_mode === "template"
                ? "固定模板"
                : "模板润色"}
              {" · 可直接导入模板文件"}
            </div>
            <div className="mt-1 text-xs leading-6 text-stone-500">
              导入模板文件只会自动带入正文，不会自动生成主题。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-stone-200/80 bg-white/90 px-3 py-1 text-xs text-stone-600">
              {hasSubject ? "主题（必填）已填写" : "主题（必填）未填写"}
            </span>
            <span className="rounded-full border border-stone-200/80 bg-white/90 px-3 py-1 text-xs text-stone-600">
              {hasTextTemplate
                ? "纯文本正文（必填）已填写"
                : "纯文本正文（必填）未填写"}
            </span>
            <span className="rounded-full border border-stone-200/80 bg-white/90 px-3 py-1 text-xs text-stone-600">
              {hasHtmlTemplate
                ? "HTML 正文（可选）已填写"
                : "HTML 正文（可选）未填写"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-2 rounded-2xl border border-stone-300 bg-white/95 px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-white"
        >
          <FolderOpen className="h-4 w-4" />
          打开默认值编辑
        </button>
      </div>
    </div>
  );
};

const OutreachTemplateModal = ({
  open,
  importingTemplateFile,
  form,
  onClose,
  onImport,
  onModeChange,
  onSubjectChange,
  onBodyTextChange,
  onBodyHtmlChange,
}: {
  open: boolean;
  importingTemplateFile: boolean;
  form: IdentityFormState;
  onClose: () => void;
  onImport: (file: File) => void;
  onModeChange: (value: OutreachGenerationMode) => void;
  onSubjectChange: (value: string) => void;
  onBodyTextChange: (value: string) => void;
  onBodyHtmlChange: (value: string) => void;
}) => {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/35 p-4 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#fffdfa,#fff7ee_18%,#ffffff_40%)] shadow-[0_30px_90px_-28px_rgba(41,37,36,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-stone-200/80 bg-white/75 px-6 py-5 backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.26em] text-stone-400">
                Outreach Defaults
              </div>
              <h3 className="mt-2 text-2xl font-semibold text-stone-900">
                默认发信模式与默认模板
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
                在这里设置新任务默认带出的模式，以及主题、纯文本正文和 HTML 正文。
                主题和纯文本正文为必填，HTML 正文为可选；这些内容只会影响后续新任务，不会反向改掉已经创建好的任务。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-900"
              aria-label="关闭默认值编辑窗口"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-stone-200/80 bg-[#fffaf3] px-6 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-medium text-stone-900">当前默认值摘要</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-stone-500">
                <span className="rounded-full border border-stone-200 bg-white/90 px-3 py-1">
                  模式：{form.outreach_generation_mode === 'template' ? '固定模板' : '模板润色'}
                </span>
                <span className="rounded-full border border-stone-200 bg-white/90 px-3 py-1">
                  主题（必填）：{form.outreach_template_subject.trim() ? '已填写' : '未填写'}
                </span>
                <span className="rounded-full border border-stone-200 bg-white/90 px-3 py-1">
                  纯文本正文（必填）：{form.outreach_template_body_text.trim() ? '已填写' : '未填写'}
                </span>
                <span className="rounded-full border border-stone-200 bg-white/90 px-3 py-1">
                  HTML 正文（可选）：{form.outreach_template_body_html.trim() ? '已填写' : '未填写'}
                </span>
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-300 hover:text-stone-900">
              {importingTemplateFile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              导入默认模板文件
              <input
                type="file"
                accept={TEMPLATE_FILE_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (!file) {
                    return;
                  }
                  onImport(file);
                }}
              />
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  value: 'llm' as const,
                  title: '模板润色',
                  description: '新任务必须先有套磁信模板，AI 只会基于模板做小幅定制化润色。',
                },
                {
                  value: 'template' as const,
                  title: '固定模板',
                  description: '新任务默认渲染你提供的主题和正文模板，适合稳定话术和批量统一发送。',
                },
              ].map((option) => {
                const active = form.outreach_generation_mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onModeChange(option.value)}
                    className={clsx(
                      'rounded-[26px] border px-4 py-4 text-left transition',
                      active
                        ? 'border-primary/20 bg-primary/5 shadow-sm shadow-primary/10'
                        : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-stone-900">{option.title}</div>
                      {active ? (
                        <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-white">
                          当前默认
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{option.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-stone-500">
              {TEMPLATE_PLACEHOLDERS.map(([token, label]) => (
                <span
                  key={token}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1"
                >
                  {token} {label}
                </span>
              ))}
            </div>

            <div className="grid gap-4">
              <label className="block">
                {renderFieldLabel('默认模板主题', true)}
                <input
                  value={form.outreach_template_subject}
                  onChange={(event) => onSubjectChange(event.target.value)}
                  className={inputClassName}
                  placeholder="例如：申请与 {{name}} 老师交流科研方向"
                />
              </label>
              <label className="block">
                {renderFieldLabel('默认模板正文（纯文本）', true)}
                <textarea
                  value={form.outreach_template_body_text}
                  onChange={(event) => onBodyTextChange(event.target.value)}
                  className="min-h-44 w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder={`支持直接粘贴文本。

例如：{{name}}老师您好，
我是{{sender_name}}，关注到您在{{research_direction}}方向的工作……`}
                />
              </label>
              <p className="text-xs leading-6 text-stone-500">
                导入模板文件时只会自动带入正文内容，不会自动生成主题；如果主题仍为空，请继续填写后再保存身份。
              </p>
              <HtmlTemplateEditorField
                label="默认模板正文（HTML，可保留格式）"
                value={form.outreach_template_body_html}
                onChange={onBodyHtmlChange}
                placeholder="<p>{{name}}老师您好，</p><p>我是{{sender_name}}，关注到您在{{research_direction}}方向的工作……</p>"
              />
            </div>

            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/85 px-4 py-3 text-xs leading-6 text-stone-500">
              {form.outreach_generation_mode === 'template'
                ? '固定模板模式会作为新任务的默认值；任务创建后会把当时模板快照进去，不会再跟随身份默认值漂移。'
                : '模板润色模式会把这里的模板当作母版；AI 只允许小幅改动称呼、匹配理由、个性化一段、结尾和主题，不会重写整体结构。'}
            </div>
          </div>
        </div>

        <div className="border-t border-stone-200/80 bg-white/80 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs leading-6 text-stone-500">
              这里的修改会暂存到当前身份表单中。关闭弹窗后，记得点击页面底部的“保存身份”。
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ui-btn-secondary"
            >
              完成编辑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const MaterialLibraryModal = ({
  open,
  identity,
  materials,
  busy,
  uploading,
  selectedMaterialType,
  materialFilter,
  highlightedMaterialId,
  onChangeMaterialType,
  onChangeMaterialFilter,
  onUpload,
  onClose,
  onSetPrimary,
  onDelete,
}: {
  open: boolean;
  identity: IdentityDTO;
  materials: IdentityMaterialDTO[];
  busy: boolean;
  uploading: boolean;
  selectedMaterialType: IdentityMaterialType;
  materialFilter: MaterialFilterValue;
  highlightedMaterialId: number | null;
  onChangeMaterialType: (value: IdentityMaterialType) => void;
  onChangeMaterialFilter: (value: MaterialFilterValue) => void;
  onUpload: (file: File) => void;
  onClose: () => void;
  onSetPrimary: (material: IdentityMaterialDTO) => void;
  onDelete: (material: IdentityMaterialDTO) => void;
}) => {
  if (!open) {
    return null;
  }

  const primaryMaterial = identity.current_primary_material;
  const visibleMaterials =
    materialFilter === "all"
      ? materials
      : materials.filter(
          (material) => material.material_type === materialFilter,
        );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/35 p-4 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#fffdfa,#fff7ee_18%,#ffffff_40%)] shadow-[0_30px_90px_-28px_rgba(41,37,36,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-stone-200/80 bg-white/75 px-6 py-5 backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.26em] text-stone-400">
                Material Library
              </div>
              <h3 className="mt-2 text-2xl font-semibold text-stone-900">
                材料管理
              </h3>
              <p className="mt-1 text-sm text-stone-500">
                {identity.materials.length} 份材料
                {primaryMaterial
                  ? ` · 默认材料：${primaryMaterial.display_name}`
                  : " · 当前未设默认材料"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-900"
              aria-label="关闭材料库"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-stone-200/80 bg-[#fffaf3] px-6 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-[6.5rem]">
                <div className="text-sm font-medium text-stone-900">
                  上传新材料
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  先选类型，再上传文件
                </div>
              </div>
              <MaterialTypePicker
                value={selectedMaterialType}
                onChange={onChangeMaterialType}
              />
              <span className="inline-flex items-center rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-xs text-stone-600 shadow-sm shadow-stone-100/70">
                当前：{getMaterialTypeLabel(selectedMaterialType)}
              </span>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-primary/20 bg-primary px-4 py-3 text-sm font-medium text-white shadow-sm shadow-primary/20 transition hover:bg-primary-dark">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              上传材料
              <input
                type="file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) {
                    return;
                  }
                  onUpload(file);
                }}
              />
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-stone-900">查看材料</div>
            </div>
            <MaterialFilterBar
              value={materialFilter}
              materials={materials}
              onChange={onChangeMaterialFilter}
            />
          </div>

          {materials.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-stone-200 bg-white/75 px-6 py-12 text-center text-sm text-stone-500">
              还没有材料，先上传一份即可。
            </div>
          ) : visibleMaterials.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-stone-200 bg-white/75 px-6 py-12 text-center text-sm text-stone-500">
              当前筛选下还没有材料，试试切回“全部”。
            </div>
          ) : (
            <div className="space-y-3">
              {visibleMaterials.map((material) => {
                const canPromote = canUseAsPrimaryMaterial(material);
                return (
                  <article
                    key={material.id}
                    data-material-id={material.id}
                    className={clsx(
                      "rounded-[26px] border px-5 py-4 shadow-sm transition",
                      material.is_primary
                        ? "border-primary/20 bg-primary/5 shadow-primary/5"
                        : "border-stone-200 bg-white shadow-stone-100/60",
                      highlightedMaterialId === material.id &&
                        "border-amber-300 bg-amber-50/70 shadow-amber-100",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-stone-900">
                            {material.display_name}
                          </h3>
                          {material.is_primary ? (
                            <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-white">
                              默认材料
                            </span>
                          ) : null}
                          {!canPromote ? (
                            <span className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-[11px] text-stone-500">
                              仅随信发送
                            </span>
                          ) : null}
                          <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-600">
                            {MATERIAL_TYPE_LABELS[material.material_type]}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-stone-500">
                          <span>{material.original_filename}</span>
                          <span>{formatFileSize(material.size_bytes)}</span>
                          <span>{formatApiDateTime(material.created_at)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openFileInNewTab(getMaterialOpenUrl(material.id))
                          }
                          className="ui-btn-secondary"
                        >
                          <ExternalLink className="h-4 w-4" />
                          打开
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            triggerDownload(getMaterialDownloadUrl(material.id))
                          }
                          className="ui-btn-secondary"
                        >
                          <Download className="h-4 w-4" />
                          下载
                        </button>
                        {material.is_primary ? (
                          <span className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                            已设为默认材料
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy || !canPromote}
                            onClick={() => onSetPrimary(material)}
                            className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {canPromote ? "设为默认材料" : "不可设默认材料"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onDelete(material)}
                          className="ui-btn-danger disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ProfilePage = () => {
  const {
    identities,
    llmProfiles,
    systemSettings,
    selectedIdentityId,
    selectedLlmProfileId,
    selectedIdentity,
    selectedLlmProfile,
    setSelectedIdentityId,
    setSelectedLlmProfileId,
    refreshSelections,
    loading,
  } = useSelectionContext();
  const { notifyError, notifyFormErrors, notifySuccess } = useNotification();
  const [identityEditorId, setIdentityEditorId] = useState<EditorId>(null);
  const [llmEditorId, setLlmEditorId] = useState<EditorId>(null);
  const [identityForm, setIdentityForm] = useState<IdentityFormState>(
    createEmptyIdentityForm(),
  );
  const [llmForm, setLlmForm] = useState<LLMFormState>(createEmptyLLMForm());
  const [submittingIdentity, setSubmittingIdentity] = useState(false);
  const [submittingLLM, setSubmittingLLM] = useState(false);
  const [importingTemplateFile, setImportingTemplateFile] = useState(false);
  const [testingIdentityConnection, setTestingIdentityConnection] = useState<
    "smtp" | "imap" | null
  >(null);
  const [lastIdentityConnectionResult, setLastIdentityConnectionResult] =
    useState<IdentityConnectionTestSummary | null>(null);
  const [testingLLMConnection, setTestingLLMConnection] = useState(false);
  const [fetchingLLMModels, setFetchingLLMModels] = useState(false);
  const [llmProbeResult, setLlmProbeResult] =
    useState<LLMProfileTestResultDTO | null>(null);
  const [llmModelsResult, setLlmModelsResult] =
    useState<LLMProfileModelsResultDTO | null>(null);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [actingOnMaterial, setActingOnMaterial] = useState(false);
  const [newMaterialType, setNewMaterialType] =
    useState<IdentityMaterialType>("resume");
  const [materialFilter, setMaterialFilter] =
    useState<MaterialFilterValue>("all");
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [highlightedMaterialId, setHighlightedMaterialId] = useState<
    number | null
  >(null);
  const [optimisticMaterial, setOptimisticMaterial] =
    useState<IdentityMaterialDTO | null>(null);
  const identityNameInputRef = useRef<HTMLInputElement | null>(null);
  const llmNameInputRef = useRef<HTMLInputElement | null>(null);
  const identityEditorIdRef = useRef<EditorId>(null);
  const templateSubjectRef = useRef("");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  identityEditorIdRef.current = identityEditorId;
  templateSubjectRef.current = identityForm.outreach_template_subject;

  const focusInput = (element: HTMLInputElement | null) => {
    if (!element) {
      return;
    }
    element.focus();
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const getActionErrorMessage = (error: unknown, fallbackMessage: string) =>
    error instanceof Error ? error.message : fallbackMessage;

  const applyIdentityEditorState = useCallback(
    (nextEditor: IdentityDTO | "new") => {
      if (nextEditor === "new") {
        setIdentityEditorId("new");
        setIdentityForm(createEmptyIdentityForm());
      } else {
        setIdentityEditorId(nextEditor.id);
        setIdentityForm(toIdentityForm(nextEditor));
      }
      setTemplateModalOpen(false);
      setTestingIdentityConnection(null);
      setLastIdentityConnectionResult(null);
      setHighlightedMaterialId(null);
      setOptimisticMaterial(null);
    },
    [],
  );

  const confirmDeleteTwice = async (targetName: string) => {
    const confirmedOnce = await confirm({
      title: `确认删除${targetName}？`,
      description: "这会移除当前内容，但还不会立即执行最终删除。",
      confirmLabel: "继续删除",
      cancelLabel: "先不删",
      tone: "danger",
    });

    if (!confirmedOnce) {
      return false;
    }

    return confirm({
      title: `再次确认删除${targetName}`,
      description: "删除后无法恢复，请再确认一次。",
      confirmLabel: "确认删除",
      cancelLabel: "返回",
      tone: "danger",
    });
  };

  useEffect(() => {
    if (loading || identityEditorId === "new") {
      return;
    }
    if (
      isExistingEditorId(identityEditorId) &&
      identities.some((item) => item.id === identityEditorId)
    ) {
      return;
    }

    const fallback =
      identities.find((item) => item.id === selectedIdentityId) ??
      identities[0] ??
      null;

    if (fallback) {
      applyIdentityEditorState(fallback);
      return;
    }

    applyIdentityEditorState("new");
  }, [applyIdentityEditorState, identities, identityEditorId, loading, selectedIdentityId]);

  useEffect(() => {
    if (loading || llmEditorId === "new") {
      return;
    }
    if (
      isExistingEditorId(llmEditorId) &&
      llmProfiles.some((item) => item.id === llmEditorId)
    ) {
      return;
    }

    const fallback =
      llmProfiles.find((item) => item.id === selectedLlmProfileId) ??
      llmProfiles[0] ??
      null;

    if (fallback) {
      setLlmEditorId(fallback.id);
      setLlmForm(toLLMForm(fallback));
      return;
    }

    setLlmEditorId("new");
    setLlmForm(createEmptyLLMForm());
  }, [llmEditorId, llmProfiles, loading, selectedLlmProfileId]);

  useEffect(() => {
    if (!materialModalOpen && !templateModalOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (templateModalOpen) {
          setTemplateModalOpen(false);
          return;
        }
        setMaterialModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [materialModalOpen, templateModalOpen]);

  const editingIdentity = isExistingEditorId(identityEditorId)
    ? (identities.find((item) => item.id === identityEditorId) ?? null)
    : null;
  const editingLLM = isExistingEditorId(llmEditorId)
    ? (llmProfiles.find((item) => item.id === llmEditorId) ?? null)
    : null;

  const defaultIdentity = identities.find((item) => item.is_default) ?? null;
  const defaultLLMProfile = llmProfiles.find((item) => item.is_default) ?? null;
  const llmModelsActionState: ActionResultState = llmModelsResult
    ? llmModelsResult.ok
      ? "success"
      : "error"
    : "idle";
  const llmProbeActionState: ActionResultState = llmProbeResult
    ? llmProbeResult.ok
      ? "success"
      : "error"
    : "idle";
  const displayIdentity = useMemo(() => {
    if (
      !editingIdentity ||
      !optimisticMaterial ||
      editingIdentity.materials.some(
        (material) => material.id === optimisticMaterial.id,
      )
    ) {
      return editingIdentity;
    }

    return {
      ...editingIdentity,
      materials: [optimisticMaterial, ...editingIdentity.materials],
      current_primary_material: optimisticMaterial.is_primary
        ? optimisticMaterial
        : editingIdentity.current_primary_material,
      current_primary_material_id: optimisticMaterial.is_primary
        ? optimisticMaterial.id
        : editingIdentity.current_primary_material_id,
    };
  }, [editingIdentity, optimisticMaterial]);

  useEffect(() => {
    if (!editingIdentity) {
      setMaterialModalOpen(false);
    }
  }, [editingIdentity]);

  useEffect(() => {
    if (!editingIdentity || !optimisticMaterial) {
      return;
    }
    if (
      editingIdentity.materials.some(
        (material) => material.id === optimisticMaterial.id,
      )
    ) {
      setOptimisticMaterial(null);
    }
  }, [editingIdentity, optimisticMaterial]);

  useEffect(() => {
    if (!materialModalOpen || highlightedMaterialId === null) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `[data-material-id="${highlightedMaterialId}"]`,
      );
      element?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [displayIdentity, highlightedMaterialId, materialModalOpen]);

  const beginIdentityCreation = () => {
    applyIdentityEditorState("new");
    window.requestAnimationFrame(() =>
      focusInput(identityNameInputRef.current),
    );
  };

  const beginLLMCreation = () => {
    setLlmEditorId("new");
    setLlmForm(createEmptyLLMForm());
    setLlmProbeResult(null);
    setLlmModelsResult(null);
    setTestingLLMConnection(false);
    setFetchingLLMModels(false);
    window.requestAnimationFrame(() => focusInput(llmNameInputRef.current));
  };

  const openIdentityEditor = (identityId: number) => {
    const identity = identities.find((item) => item.id === identityId);
    if (!identity) {
      return;
    }
    applyIdentityEditorState(identity);
  };

  const openLLMEditor = (profileId: number) => {
    const profile = llmProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }
    setLlmEditorId(profile.id);
    setLlmForm(toLLMForm(profile));
    setLlmProbeResult(null);
    setLlmModelsResult(null);
    setTestingLLMConnection(false);
    setFetchingLLMModels(false);
  };

  const handleSmtpHostChange = (nextSmtpHost: string) => {
    setIdentityForm((previous) => ({
      ...previous,
      smtp_host: nextSmtpHost,
      imap_host: shouldSyncImapHost(previous.smtp_host, previous.imap_host)
        ? inferImapHost(nextSmtpHost)
        : previous.imap_host,
    }));
  };

  const runIdentityConnectionTest = async (kind: "smtp" | "imap") => {
    if (!editingIdentity) {
      return;
    }

    setTestingIdentityConnection(kind);
    try {
      const result =
        kind === "smtp"
          ? await testIdentitySmtp(editingIdentity.id)
          : await testIdentityImap(editingIdentity.id);
      setLastIdentityConnectionResult({
        kind,
        status: "success",
        message: result.message,
      });
      notifySuccess(`${kind.toUpperCase()} 连接测试成功`, result.message);
    } catch (testError) {
      const message = getActionErrorMessage(
        testError,
        `${kind.toUpperCase()} 测试失败`,
      );
      setLastIdentityConnectionResult({
        kind,
        status: "error",
        message,
      });
      notifyError(
        `${kind.toUpperCase()} 连接测试失败`,
        message,
      );
    } finally {
      setTestingIdentityConnection(null);
    }
  };

  const handleTemplateFileImport = async (file: File) => {
    const importTargetEditorId = identityEditorId;

    setImportingTemplateFile(true);
    try {
      const imported = await importIdentityTemplate(file);
      if (identityEditorIdRef.current !== importTargetEditorId) {
        return;
      }

      const hasSubject = Boolean(templateSubjectRef.current.trim());
      setIdentityForm((previous) => ({
        ...previous,
        outreach_template_body_text: imported.body_text,
        outreach_template_body_html: imported.body_html,
      }));
      notifySuccess(
        "模板导入成功",
        hasSubject
          ? `已导入 ${imported.format_name} 模板文件，并自动生成纯文本正文。`
          : `已导入 ${imported.format_name} 模板文件，并自动生成纯文本正文。请继续填写模板主题后再保存身份。`,
      );
    } catch (importError) {
      notifyError(
        "模板导入失败",
        getActionErrorMessage(importError, "导入模板文件失败"),
      );
    } finally {
      setImportingTemplateFile(false);
    }
  };

  const runLlmConnectionTest = async () => {
    if (!editingLLM) {
      return;
    }

    setTestingLLMConnection(true);
    setLlmProbeResult(null);
    try {
      const result = await testLLMProfile(editingLLM.id);
      setLlmProbeResult(result);
    } catch (testError) {
      setLlmProbeResult({
        ok: false,
        message:
          testError instanceof Error ? testError.message : "连接测试失败",
        resolved_base_url: null,
        request_url: null,
        attempted_urls: [],
        endpoint_kind: null,
        status_code: null,
        duration_ms: null,
        consumes_tokens: true,
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        response_preview: null,
      });
    } finally {
      setTestingLLMConnection(false);
    }
  };

  const runLlmModelsFetch = async () => {
    if (!editingLLM) {
      return;
    }

    setFetchingLLMModels(true);
    setLlmModelsResult(null);
    try {
      const result = await fetchLLMProfileModels(editingLLM.id);
      setLlmModelsResult(result);
    } catch (testError) {
      setLlmModelsResult({
        ok: false,
        message:
          testError instanceof Error ? testError.message : "获取模型列表失败",
        resolved_base_url: null,
        request_url: null,
        attempted_urls: [],
        endpoint_kind: null,
        status_code: null,
        duration_ms: null,
        consumes_tokens: false,
        models: [],
        selected_model_available: null,
      });
    } finally {
      setFetchingLLMModels(false);
    }
  };

  const handleSelectSuggestedModel = (modelName: string) => {
    setLlmForm((previous) => ({
      ...previous,
      model_name: modelName,
    }));
  };

  const saveIdentity = async () => {
    if (
      !identityForm.name.trim() ||
      !identityForm.email_address.trim() ||
      !identityForm.smtp_host.trim() ||
      !identityForm.smtp_password.trim() ||
      !identityForm.imap_host.trim() ||
      !identityForm.imap_port.trim()
    ) {
      notifyFormErrors("请检查表单", [
        "请先填写所有带红色星号的身份必填项",
      ]);
      return;
    }
    const templateValidationMessage = getTemplateValidationMessage(identityForm);
    if (templateValidationMessage) {
      notifyFormErrors("请检查表单", [templateValidationMessage]);
      return;
    }

    setSubmittingIdentity(true);
    try {
      const payload = toIdentityPayload(identityForm);
      const saved = isExistingEditorId(identityEditorId)
        ? await updateIdentity(identityEditorId, payload)
        : await createIdentity(payload);
      const isCreatingIdentity = identityEditorId === "new";
      await refreshSelections();
      setIdentityEditorId(saved.id);
      setIdentityForm(toIdentityForm(saved));
      notifySuccess(
        "身份保存成功",
        isCreatingIdentity ? "身份已创建。" : "身份已保存。",
      );
    } catch (saveError) {
      notifyError(
        "身份保存失败",
        getActionErrorMessage(saveError, "身份保存失败"),
      );
    } finally {
      setSubmittingIdentity(false);
    }
  };

  const saveLLM = async () => {
    if (
      !llmForm.name.trim() ||
      !llmForm.api_base_url.trim() ||
      !llmForm.api_key.trim() ||
      !llmForm.model_name.trim()
    ) {
      notifyFormErrors("请检查表单", ["请先填写所有带红色星号的模型必填项"]);
      return;
    }

    setSubmittingLLM(true);
    try {
      const payload = toLLMPayload(llmForm);
      const saved = isExistingEditorId(llmEditorId)
        ? await updateLLMProfile(llmEditorId, payload)
        : await createLLMProfile(payload);
      const isCreatingLlm = llmEditorId === "new";
      await refreshSelections();
      setLlmEditorId(saved.id);
      setLlmForm(toLLMForm(saved));
      notifySuccess(
        "模型保存成功",
        isCreatingLlm ? "模型配置已创建。" : "模型配置已保存。",
      );
    } catch (saveError) {
      notifyError(
        "模型保存失败",
        getActionErrorMessage(saveError, "模型配置保存失败"),
      );
    } finally {
      setSubmittingLLM(false);
    }
  };

  const handleMaterialUpload = async (file: File) => {
    if (!editingIdentity) {
      return;
    }
    setUploadingMaterial(true);
    try {
      const uploadedMaterial = await uploadIdentityMaterial(
        editingIdentity.id,
        {
          file,
          materialType: newMaterialType,
        },
      );
      setOptimisticMaterial(uploadedMaterial);
      setMaterialFilter(uploadedMaterial.material_type);
      setHighlightedMaterialId(uploadedMaterial.id);
      await refreshSelections();
      notifySuccess(
        "材料上传成功",
        `已上传为${getMaterialTypeLabel(uploadedMaterial.material_type)}：${uploadedMaterial.display_name}`,
      );
    } catch (uploadError) {
      notifyError(
        "材料上传失败",
        getActionErrorMessage(uploadError, "材料上传失败"),
      );
    } finally {
      setUploadingMaterial(false);
    }
  };

  const handleSetPrimaryMaterial = async (material: IdentityMaterialDTO) => {
    setActingOnMaterial(true);
    try {
      await setPrimaryMaterial(material.id);
      await refreshSelections();
      notifySuccess(
        "设为默认材料成功",
        `已将“${material.display_name}”设为默认材料。`,
      );
      setHighlightedMaterialId(material.id);
    } catch (materialError) {
      notifyError(
        "设为默认材料失败",
        getActionErrorMessage(materialError, "设置默认材料失败"),
      );
    } finally {
      setActingOnMaterial(false);
    }
  };

  const handleDeleteMaterial = async (material: IdentityMaterialDTO) => {
    if (!(await confirmDeleteTwice(`材料“${material.display_name}”`))) {
      return;
    }
    setActingOnMaterial(true);
    try {
      await deleteMaterial(material.id);
      await refreshSelections();
      notifySuccess(
        "删除材料成功",
        material.is_primary
          ? `材料“${material.display_name}”已删除，当前未设默认材料。`
          : `材料“${material.display_name}”已删除。`,
      );
      if (optimisticMaterial?.id === material.id) {
        setOptimisticMaterial(null);
      }
      if (highlightedMaterialId === material.id) {
        setHighlightedMaterialId(null);
      }
    } catch (materialError) {
      notifyError(
        "删除材料失败",
        getActionErrorMessage(materialError, "删除材料失败"),
      );
    } finally {
      setActingOnMaterial(false);
    }
  };

  const identityActionButtons = (
    <div className="mt-6 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => void saveIdentity()}
        disabled={submittingIdentity}
        className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submittingIdentity && <Loader2 className="h-4 w-4 animate-spin" />}
        保存身份
      </button>
      {editingIdentity && (
        <>
          {selectedIdentityId === editingIdentity.id ? (
            <span className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              当前使用中
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSelectedIdentityId(editingIdentity.id);
                notifySuccess(
                  "已设为当前身份",
                  `当前身份已切换为“${editingIdentity.name}”。`,
                );
              }}
              className="ui-btn-secondary"
            >
              设为当前
            </button>
          )}
          {editingIdentity.is_default ? (
            <span className="inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
              已设为默认
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                void setDefaultIdentity(editingIdentity.id)
                  .then(async () => {
                    await refreshSelections();
                    setIdentityForm((previous) => ({
                      ...previous,
                      is_default: true,
                    }));
                    notifySuccess(
                      "已设为默认身份",
                      `“${editingIdentity.name}”已设为默认身份。`,
                    );
                  })
                  .catch((defaultError) => {
                    notifyError(
                      "设为默认身份失败",
                      getActionErrorMessage(defaultError, "设置默认身份失败"),
                    );
                  });
              }}
              className="ui-btn-secondary"
            >
              设为默认
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void (async () => {
                if (!(await confirmDeleteTwice(`身份“${editingIdentity.name}”`))) {
                  return;
                }
                try {
                  await deleteIdentity(editingIdentity.id);
                  await refreshSelections();
                  setIdentityEditorId(null);
                  setIdentityForm(createEmptyIdentityForm());
                  notifySuccess(
                    "删除身份成功",
                    `身份“${editingIdentity.name}”已删除。`,
                  );
                } catch (deleteError) {
                  notifyError(
                    "删除身份失败",
                    getActionErrorMessage(deleteError, "删除身份失败"),
                  );
                }
              })();
            }}
            className="ui-btn-danger"
          >
            删除
          </button>
        </>
      )}
    </div>
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="rounded-3xl border border-stone-200 bg-[#fcfbf8] p-6 shadow-sm">
        <h1 className="text-3xl font-semibold text-stone-900">个人页</h1>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-stone-600">
          <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
            模式：
            {
              MAIL_DELIVERY_MODE_LABELS[
                systemSettings?.mail_delivery_mode ?? "dry_run"
              ]
            }
          </span>
          <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
            身份：{selectedIdentity?.name ?? "未选择"}
          </span>
          <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
            模型：{selectedLlmProfile?.name ?? "未选择"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-3xl border border-stone-200 bg-white px-6 py-14 text-sm text-stone-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载配置...
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <section className="rounded-3xl border border-stone-200 bg-[linear-gradient(135deg,rgba(248,244,236,0.95),rgba(255,255,255,0.98))] p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">
                  首次配置建议
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  建议顺序：先完成发件身份，再准备材料与模板，最后配置模型。
                </p>
              </div>
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600">
                新用户上手流程
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {PROFILE_SETUP_STAGES.map((stage) => (
                <span
                  key={stage}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm"
                >
                  {stage}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">
                  发件身份
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  先把发件邮箱、SMTP 和 IMAP 一起配好，完成第一步发件身份准备。
                </p>
              </div>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
                默认身份：{defaultIdentity?.name ?? "未设置"}
              </span>
            </div>

            <div className="mt-5 rounded-3xl border border-stone-200 bg-[#fcfbf8] p-4">
              <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                <EditorSwitcher
                  label="当前编辑的身份配置"
                  helper={
                    identities.length > 0 ? "点选切换，或新建一套。" : undefined
                  }
                  options={identities}
                  activeId={identityEditorId}
                  createLabel="新建身份配置"
                  creatingLabel={
                    identities.length > 0
                      ? "正在新建身份配置"
                      : "新建第一套身份配置"
                  }
                  onCreate={beginIdentityCreation}
                  onSelect={openIdentityEditor}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-400">
                      使用中
                    </div>
                    <div className="mt-2 text-sm font-medium text-stone-900">
                      {selectedIdentity?.name ?? "未选择"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-400">
                      编辑中
                    </div>
                    <div className="mt-2 text-sm font-medium text-stone-900">
                      {editingIdentity
                        ? `正在编辑 ${editingIdentity.name}`
                        : "正在新建身份配置"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                {renderFieldLabel("配置名称", true)}
                <input
                  ref={identityNameInputRef}
                  value={identityForm.name}
                  onChange={(event) =>
                    setIdentityForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：博士申请邮箱"
                />
              </label>
              <label className="block">
                {renderFieldLabel("发件邮箱", true)}
                <input
                  value={identityForm.email_address}
                  onChange={(event) =>
                    setIdentityForm((previous) => ({
                      ...previous,
                      email_address: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：your.name@example.com"
                />
              </label>
              <label className="block">
                {renderFieldLabel("SMTP Host", true)}
                <input
                  value={identityForm.smtp_host}
                  onChange={(event) => handleSmtpHostChange(event.target.value)}
                  className={inputClassName}
                  placeholder="示例：smtp.qq.com"
                />
              </label>
              <label className="block">
                {renderFieldLabel("SMTP Port", true)}
                <input
                  type="number"
                  value={identityForm.smtp_port}
                  onChange={(event) =>
                    setIdentityForm((previous) => ({
                      ...previous,
                      smtp_port: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：465"
                />
              </label>
              <label className="block md:col-span-2">
                {renderFieldLabel("SMTP 密码", true)}
                <input
                  type="password"
                  value={identityForm.smtp_password}
                  onChange={(event) =>
                    setIdentityForm((previous) => ({
                      ...previous,
                      smtp_password: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：邮箱授权码或应用专用密码"
                />
              </label>
              <label className="block">
                {renderFieldLabel("IMAP Host", true)}
                <input
                  value={identityForm.imap_host}
                  onChange={(event) =>
                    setIdentityForm((previous) => ({
                      ...previous,
                      imap_host: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：imap.qq.com"
                />
              </label>
              <label className="block">
                {renderFieldLabel("IMAP Port", true)}
                <input
                  type="number"
                  value={identityForm.imap_port}
                  onChange={(event) =>
                    setIdentityForm((previous) => ({
                      ...previous,
                      imap_port: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：993"
                />
              </label>
            </div>

            {editingIdentity ? (
              <div className="mt-6">
                <IdentityConnectionCard
                  testingIdentityConnection={testingIdentityConnection}
                  lastResult={lastIdentityConnectionResult}
                  onTestSmtp={() => void runIdentityConnectionTest("smtp")}
                  onTestImap={() => void runIdentityConnectionTest("imap")}
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">
                  材料与模板
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  第二步补齐默认模板和常用材料，后续导入导师后就能直接开始准备任务。
                </p>
              </div>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
                任务前置内容
              </span>
            </div>

            <div className="mt-6">
              <OutreachTemplateSummaryCard
                form={identityForm}
                onOpen={() => setTemplateModalOpen(true)}
              />
            </div>

            {editingIdentity && (
              <div className="mt-6">
                <MaterialSummaryCard
                  identity={displayIdentity ?? editingIdentity}
                  onOpen={() => {
                    setMaterialFilter("all");
                    setHighlightedMaterialId(null);
                    setMaterialModalOpen(true);
                  }}
                />
              </div>
            )}
            {!editingIdentity ? (
              <div className="mt-6 rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-4 text-sm leading-6 text-stone-500">
                先创建并保存一个发件身份，再回来上传材料和设置默认材料。
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">
                  模型配置
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  第三步补齐 AI 模型，后续创建任务时就能直接选择并测试可用模型。
                </p>
              </div>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
                默认模型：{defaultLLMProfile?.name ?? "未设置"}
              </span>
            </div>

            <div className="mt-5 rounded-3xl border border-stone-200 bg-[#fcfbf8] p-4">
              <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                <EditorSwitcher
                  label="当前编辑的模型配置"
                  helper={
                    llmProfiles.length > 0
                      ? "点选切换，或新建一套。"
                      : undefined
                  }
                  options={llmProfiles}
                  activeId={llmEditorId}
                  createLabel="新建模型配置"
                  creatingLabel={
                    llmProfiles.length > 0
                      ? "正在新建模型配置"
                      : "新建第一套模型配置"
                  }
                  onCreate={beginLLMCreation}
                  onSelect={openLLMEditor}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-400">
                      使用中
                    </div>
                    <div className="mt-2 text-sm font-medium text-stone-900">
                      {selectedLlmProfile?.name ?? "未选择"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-400">
                      编辑中
                    </div>
                    <div className="mt-2 text-sm font-medium text-stone-900">
                      {editingLLM
                        ? `正在编辑 ${editingLLM.name}`
                        : "正在新建模型配置"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
                  OpenAI 兼容
                </span>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
                  Temperature {DEFAULT_LLM_TEMPERATURE}
                </span>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
                  Max Tokens {DEFAULT_LLM_MAX_TOKENS}
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                {renderFieldLabel("配置名称", true)}
                <input
                  ref={llmNameInputRef}
                  value={llmForm.name}
                  onChange={(event) =>
                    setLlmForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：主力 GPT-5.4"
                />
              </label>
              <label className="block md:col-span-2">
                {renderFieldLabel("API Base URL", true)}
                <input
                  value={llmForm.api_base_url}
                  onChange={(event) =>
                    setLlmForm((previous) => ({
                      ...previous,
                      api_base_url: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：https://api.openai.com/v1"
                />
              </label>
              <label className="block">
                {renderFieldLabel("API Key", true)}
                <input
                  type="password"
                  value={llmForm.api_key}
                  onChange={(event) =>
                    setLlmForm((previous) => ({
                      ...previous,
                      api_key: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：sk-xxxxxxxxxxxxxxxx"
                />
              </label>
              <label className="block">
                {renderFieldLabel("模型名称", true)}
                <input
                  value={llmForm.model_name}
                  onChange={(event) =>
                    setLlmForm((previous) => ({
                      ...previous,
                      model_name: event.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="示例：gpt-5.4-mini"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveLLM()}
                disabled={submittingLLM}
                className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingLLM && <Loader2 className="h-4 w-4 animate-spin" />}
                保存模型配置
              </button>
              {editingLLM && (
                <>
                  <button
                    type="button"
                    onClick={() => void runLlmModelsFetch()}
                    disabled={fetchingLLMModels}
                    className={getActionButtonClassName(
                      llmModelsActionState,
                      fetchingLLMModels,
                    )}
                  >
                    {fetchingLLMModels ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : llmModelsActionState === "success" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : llmModelsActionState === "error" ? (
                      <XCircle className="h-4 w-4" />
                    ) : null}
                    获取模型列表
                  </button>
                  <button
                    type="button"
                    onClick={() => void runLlmConnectionTest()}
                    disabled={testingLLMConnection}
                    className={getActionButtonClassName(
                      llmProbeActionState,
                      testingLLMConnection,
                    )}
                  >
                    {testingLLMConnection ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : llmProbeActionState === "success" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : llmProbeActionState === "error" ? (
                      <XCircle className="h-4 w-4" />
                    ) : null}
                    测试模型
                  </button>
                  {selectedLlmProfileId === editingLLM.id ? (
                    <span className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                      当前使用中
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLlmProfileId(editingLLM.id);
                        notifySuccess(
                          "已设为当前模型",
                          `当前模型已切换为“${editingLLM.name}”。`,
                        );
                      }}
                      className="ui-btn-secondary"
                    >
                      设为当前
                    </button>
                  )}
                  {editingLLM.is_default ? (
                    <span className="inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
                      已设为默认
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void setDefaultLLMProfile(editingLLM.id)
                          .then(async () => {
                            await refreshSelections();
                            setLlmForm((previous) => ({
                              ...previous,
                              is_default: true,
                            }));
                            notifySuccess(
                              "已设为默认模型",
                              `“${editingLLM.name}”已设为默认模型。`,
                            );
                          })
                          .catch((defaultError) => {
                            notifyError(
                              "设为默认模型失败",
                              getActionErrorMessage(
                                defaultError,
                                "设置默认模型失败",
                              ),
                            );
                          });
                      }}
                      className="ui-btn-secondary"
                    >
                      设为默认
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        if (
                          !(await confirmDeleteTwice(
                            `模型配置“${editingLLM.name}”`,
                          ))
                        ) {
                          return;
                        }
                        try {
                          await deleteLLMProfile(editingLLM.id);
                          await refreshSelections();
                          setLlmEditorId(null);
                          setLlmForm(createEmptyLLMForm());
                          notifySuccess(
                            "删除模型配置成功",
                            `模型配置“${editingLLM.name}”已删除。`,
                          );
                        } catch (deleteError) {
                          notifyError(
                            "删除模型配置失败",
                            getActionErrorMessage(
                              deleteError,
                              "删除模型配置失败",
                            ),
                          );
                        }
                      })();
                    }}
                    className="ui-btn-danger"
                  >
                    删除
                  </button>
                </>
              )}
            </div>
            {(llmModelsResult || llmProbeResult) && (
              <div className="mt-5 rounded-[30px] border border-stone-200 bg-[linear-gradient(180deg,rgba(252,251,248,0.96),rgba(255,255,255,0.98))] p-4 shadow-sm shadow-stone-200/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-stone-900">
                      连接诊断
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-stone-500">
                    {llmModelsResult ? (
                      <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1">
                        1. 基础连通性
                      </span>
                    ) : null}
                    {llmProbeResult ? (
                      <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1">
                        2. 测试模型
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  {llmModelsResult ? (
                    <div className="space-y-2">
                      <div className="pl-1 text-[11px] uppercase tracking-[0.22em] text-stone-400">
                        Step 1
                      </div>
                      <LlmModelsFeedbackPanel
                        result={llmModelsResult}
                        currentModelName={llmForm.model_name}
                        onSelectModel={handleSelectSuggestedModel}
                      />
                    </div>
                  ) : null}
                  {llmProbeResult ? (
                    <div className="space-y-2">
                      <div className="pl-1 text-[11px] uppercase tracking-[0.22em] text-stone-400">
                        Step 2
                      </div>
                      <LlmTestFeedbackPanel result={llmProbeResult} />
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">
                  保存与下一步
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  完成以上 3 步后，保存当前身份与模型配置，再继续导入导师和创建任务。
                </p>
              </div>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
                流程收尾
              </span>
            </div>

            {identityActionButtons}

            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
              完成这部分后，下一步去「导师管理」导入第一批导师，再回首页开始创建任务。
            </div>
          </section>
        </div>
      )}
      <OutreachTemplateModal
        open={templateModalOpen}
        importingTemplateFile={importingTemplateFile}
        form={identityForm}
        onClose={() => setTemplateModalOpen(false)}
        onImport={(file) => void handleTemplateFileImport(file)}
        onModeChange={(value) =>
          setIdentityForm((previous) => ({
            ...previous,
            outreach_generation_mode: value,
          }))
        }
        onSubjectChange={(value) =>
          setIdentityForm((previous) => ({
            ...previous,
            outreach_template_subject: value,
          }))
        }
        onBodyTextChange={(value) =>
          setIdentityForm((previous) => ({
            ...previous,
            outreach_template_body_text: value,
          }))
        }
        onBodyHtmlChange={(value) =>
          setIdentityForm((previous) => ({
            ...previous,
            outreach_template_body_html: value,
          }))
        }
      />
      {displayIdentity && (
        <MaterialLibraryModal
          open={materialModalOpen}
          identity={displayIdentity}
          materials={displayIdentity.materials}
          busy={actingOnMaterial || uploadingMaterial}
          uploading={uploadingMaterial}
          selectedMaterialType={newMaterialType}
          materialFilter={materialFilter}
          highlightedMaterialId={highlightedMaterialId}
          onChangeMaterialType={setNewMaterialType}
          onChangeMaterialFilter={setMaterialFilter}
          onUpload={(file) => void handleMaterialUpload(file)}
          onClose={() => setMaterialModalOpen(false)}
          onSetPrimary={(material) => void handleSetPrimaryMaterial(material)}
          onDelete={(material) => void handleDeleteMaterial(material)}
        />
      )}
      {confirmDialog}
    </main>
  );
};
