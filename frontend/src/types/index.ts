export type OutreachGenerationMode = 'llm' | 'template';

export type MentorStatus = '未发送' | '已读' | '待审核' | '已回复' | '婉拒';

export interface Mentor {
  id: string;
  name: string;
  title: string;
  university: string;
  school: string;
  research: string[];
  matchScore: number;
  sentCount: number;
  status: MentorStatus;
}

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  useTLS: boolean;
}

export interface ImapConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  useSSL: boolean;
}

export interface ResumeFile {
  name: string;
  size: number;
  url: string;
}

export interface Profile {
  id: string;
  name: string;
  title: string;
  direction: string;
  avatar?: string;
  smtp: SmtpConfig;
  imap?: ImapConfig;
  resumes: ResumeFile[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LLMConfig {
  openaiApiKey?: string;
  deepseekApiKey?: string;
  model: 'openai' | 'deepseek';
  updatedAt?: string;
}

export type IdentityMaterialType = 'resume' | 'transcript' | 'publication' | 'portfolio' | 'other';

export interface IdentityMaterialDTO {
  id: number;
  display_name: string;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number;
  material_type: IdentityMaterialType;
  is_primary: boolean;
  created_at: string;
}

export interface IdentityDTO {
  id: number;
  name: string;
  profile_name: string;
  sender_name: string;
  email_address: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  imap_host: string | null;
  imap_port: number | null;
  imap_username: string | null;
  imap_password: string | null;
  default_language: string;
  outreach_generation_mode: OutreachGenerationMode;
  outreach_template_subject: string | null;
  outreach_template_body_text: string | null;
  outreach_template_body_html: string | null;
  current_primary_material_id: number | null;
  current_primary_material: IdentityMaterialDTO | null;
  match_threshold: number | null;
  daily_send_limit: number | null;
  send_interval_min: number | null;
  send_interval_max: number | null;
  same_domain_cooldown_minutes: number | null;
  is_default: boolean;
  materials: IdentityMaterialDTO[];
  created_at: string;
  updated_at: string;
}

export interface IdentityPayload {
  name: string;
  profile_name: string;
  sender_name: string;
  email_address: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  imap_host: string;
  imap_port: number;
  imap_username: string | null;
  imap_password: string | null;
  default_language: string;
  outreach_generation_mode: OutreachGenerationMode;
  outreach_template_subject: string | null;
  outreach_template_body_text: string | null;
  outreach_template_body_html: string | null;
  daily_send_limit: number | null;
  send_interval_min: number | null;
  send_interval_max: number | null;
  same_domain_cooldown_minutes: number | null;
  is_default: boolean;
}

export interface ConnectionTestResultDTO {
  ok: boolean;
  message: string;
  host: string | null;
}

export interface IdentityTemplateImportResultDTO {
  subject: string | null;
  body_text: string;
  body_html: string;
  format_name: string;
}

export interface LLMProfileDTO {
  id: number;
  name: string;
  provider: string;
  api_base_url: string | null;
  api_key: string;
  model_name: string;
  matcher_prompt_template: string | null;
  writer_prompt_template: string | null;
  temperature: number | null;
  max_tokens: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface LLMProfilePayload {
  name: string;
  provider: string;
  api_base_url: string | null;
  api_key: string;
  model_name: string;
  matcher_prompt_template: string | null;
  writer_prompt_template: string | null;
  temperature: number | null;
  max_tokens: number | null;
  is_default: boolean;
}

export interface LLMProfileTestResultDTO {
  ok: boolean;
  message: string;
  resolved_base_url: string | null;
  request_url: string | null;
  attempted_urls: string[];
  endpoint_kind: string | null;
  status_code: number | null;
  duration_ms: number | null;
  consumes_tokens: boolean;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  response_preview: string | null;
}

export interface LLMProfileModelsResultDTO {
  ok: boolean;
  message: string;
  resolved_base_url: string | null;
  request_url: string | null;
  attempted_urls: string[];
  endpoint_kind: string | null;
  status_code: number | null;
  duration_ms: number | null;
  consumes_tokens: boolean;
  models: string[];
  selected_model_available: boolean | null;
}

export interface ProfessorDashboardItemDTO {
  id: number;
  name: string;
  email: string | null;
  title: string | null;
  university: string | null;
  school: string | null;
  department: string | null;
  research_direction: string | null;
  recent_papers: string[];
  match_score: number | null;
  sent_count: number;
  status: ProfessorDashboardStatus;
}

export type ProfessorDashboardStatus =
  | 'not_contacted'
  | 'preparing'
  | 'ready_to_send'
  | 'contacted'
  | 'replied'
  | 'needs_attention';

export interface ProfessorDTO {
  id: number;
  name: string;
  email: string | null;
  title: string | null;
  university: string | null;
  school: string | null;
  department: string | null;
  research_direction: string | null;
  recent_papers: string[] | null;
  profile_url: string | null;
  source_url: string | null;
  crawl_status: string;
  skip_reason: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfessorImportResultDTO {
  inserted_count: number;
  total_count: number;
  message: string;
}

export interface ProfessorManagementItemDTO {
  id: number;
  name: string;
  email: string | null;
  title: string | null;
  university: string | null;
  school: string | null;
  department: string | null;
  research_direction: string | null;
  recent_papers: string[];
  profile_url: string | null;
  source_url: string | null;
  crawl_status: string;
  skip_reason: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfessorUpsertPayloadDTO {
  name: string;
  email: string;
  title: string | null;
  university: string | null;
  school: string | null;
  department: string | null;
  research_direction: string | null;
  recent_papers: string[];
  profile_url: string | null;
  source_url: string | null;
}

export interface ProfessorImportFileResultDTO {
  inserted_count: number;
  updated_count: number;
  failed_count: number;
  message: string;
}

export interface ProfessorBulkArchivePayloadDTO {
  ids: number[];
}

export interface ProfessorActionResultDTO {
  ok: boolean;
  affected_count: number;
  message: string;
}

export type CrawlJobStatusDTO =
  | 'queued'
  | 'running'
  | 'needs_review'
  | 'completed'
  | 'failed'
  | 'canceled';

export type CrawlCandidateReviewStatusDTO = 'pending' | 'accepted' | 'rejected' | 'merged';

export interface CrawlJobCreatePayloadDTO {
  university: string;
  school: string;
  start_url: string;
  llm_profile_id: number | null;
}

export interface CrawlJobDTO {
  id: number;
  university: string;
  school: string;
  start_url: string;
  llm_profile_id: number | null;
  status: CrawlJobStatusDTO;
  progress_current: number;
  progress_total: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrawlJobSummaryDTO extends CrawlJobDTO {
  page_count: number;
  candidate_count: number;
  latest_event_message: string | null;
}

export interface CrawlPageDTO {
  id: number;
  job_id: number;
  url: string;
  parent_url: string | null;
  fetch_method: string;
  page_type: string;
  status: string;
  title: string | null;
  text_excerpt: string | null;
  error_message: string | null;
  created_at: string;
}

export interface CrawlJobEventDTO {
  id: string;
  job_id: number;
  event_type: string;
  message: string;
  created_at: string | null;
  raw: Record<string, unknown> | null;
}

export interface CrawlCandidateDTO {
  id: number;
  job_id: number;
  professor_id: number | null;
  name: string;
  email: string | null;
  title: string | null;
  university: string | null;
  school: string | null;
  department: string | null;
  research_direction: string | null;
  recent_papers: string[];
  profile_url: string | null;
  source_url: string | null;
  confidence: number;
  field_confidence: Record<string, number> | null;
  evidence: Record<string, unknown> | null;
  review_status: CrawlCandidateReviewStatusDTO;
  created_at: string;
  updated_at: string;
}

export interface CrawlCandidateUpdatePayloadDTO {
  name: string;
  email: string | null;
  title: string | null;
  university: string | null;
  school: string | null;
  department: string | null;
  research_direction: string | null;
  recent_papers: string[];
  profile_url: string | null;
  source_url: string | null;
  review_status: CrawlCandidateReviewStatusDTO;
}

export interface CrawlJobApproveResultDTO {
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  message: string;
}

export interface CreateBatchTaskRequestDTO {
  identity_id: number;
  llm_profile_id: number;
  name: string;
  professor_ids: number[];
  schedule_type: 'immediate' | 'scheduled';
  scheduled_dates: string[] | null;
  window_start_time: string | null;
  window_end_time: string | null;
  emails_per_window: number | null;
  primary_material_id: number | null;
  email_subject: string | null;
  email_body: string | null;
  selected_material_ids: number[] | null;
  outreach_generation_mode: OutreachGenerationMode | null;
  outreach_template_subject: string | null;
  outreach_template_body_text: string | null;
  outreach_template_body_html: string | null;
}

export type BatchTaskRuntimeStatus = 'running' | 'paused' | 'stopped' | 'completed';

export type WorkspaceTaskStatus =
  | 'discovered'
  | 'matched'
  | 'review_required'
  | 'approved'
  | 'scheduled'
  | 'sent'
  | 'send_failed'
  | 'reply_detected'
  | 'canceled';

export type WorkspaceTaskStatusLabelKey = WorkspaceTaskStatus;

export interface BatchTaskCardDTO {
  id: number;
  name: string;
  status: BatchTaskRuntimeStatus;
  schedule_type: 'immediate' | 'scheduled';
  scheduled_dates: string[] | null;
  window_start_time: string | null;
  window_end_time: string | null;
  emails_per_window: number | null;
  email_subject: string | null;
  target_count: number;
  completed_count: number;
  identity_id: number;
  llm_profile_id: number;
  pending_generation_count: number;
  review_required_count: number;
  scheduled_count: number;
  sent_count: number;
  failed_count: number;
  replied_count: number;
  created_at: string;
  updated_at: string;
}

export interface BatchTaskItemDTO {
  id: number;
  professor_id: number;
  professor_name: string;
  professor_email: string | null;
  professor_title: string | null;
  professor_school: string | null;
  status: WorkspaceTaskStatus;
  match_score: number | null;
  scheduled_at: string | null;
  sent_at: string | null;
  last_send_attempt_at: string | null;
  last_error: string | null;
  is_replied: boolean;
  updated_at: string;
}

export interface WorkspaceProfessorDTO {
  id: number;
  name: string;
  email: string | null;
  title: string | null;
  university: string | null;
  school: string | null;
  research_direction: string | null;
  recent_papers: string[];
}

export interface WorkspaceIdentityDTO {
  id: number;
  name: string;
  profile_name: string;
  sender_name: string;
  email_address: string;
}

export interface WorkspaceLLMDTO {
  id: number;
  name: string;
  provider: string;
  model_name: string;
}

export interface WorkspaceTaskSummaryDTO {
  id: number | null;
  source?: string | null;
  batch_task_id: number | null;
  parent_task_id?: number | null;
  status: WorkspaceTaskStatus | null;
  cancellation_reason?: string | null;
  can_continue_manually?: boolean;
  can_write_follow_up?: boolean;
  outreach_generation_mode: OutreachGenerationMode;
  outreach_template_subject: string | null;
  outreach_template_body_text: string | null;
  outreach_template_body_html: string | null;
  match_score: number | null;
  match_reason: string | null;
  fit_points: string[];
  risk_points: string[];
  match_keywords: string[];
  generated_subject: string | null;
  generated_content_text: string | null;
  generated_content_html: string | null;
  approved_subject: string | null;
  approved_body_text: string | null;
  approved_body_html: string | null;
  primary_material_id: number | null;
  primary_material: IdentityMaterialDTO | null;
  selected_material_ids: number[] | null;
  approved_at: string | null;
  scheduled_at: string | null;
  last_send_attempt_at: string | null;
  sent_at: string | null;
  last_rfc_message_id: string | null;
  retry_count: number;
  last_error: string | null;
  is_replied: boolean;
  estimated_prompt_tokens: number | null;
  estimated_completion_tokens_upper_bound: number | null;
  estimated_total_tokens_upper_bound: number | null;
  last_draft_prompt_tokens: number | null;
  last_draft_completion_tokens: number | null;
  last_draft_total_tokens: number | null;
}

export interface WorkspaceMessageDTO {
  id: number;
  direction: 'sent' | 'received' | 'draft';
  subject: string | null;
  content: string;
  content_html: string | null;
  rfc_message_id: string | null;
  failure_summary: string | null;
  reply_headers: Record<string, unknown> | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  created_at: string;
}

export interface WorkspaceThreadDTO {
  professor: WorkspaceProfessorDTO;
  identity: WorkspaceIdentityDTO;
  llm_profile: WorkspaceLLMDTO;
  material_options: IdentityMaterialDTO[];
  current_task: WorkspaceTaskSummaryDTO;
  messages: WorkspaceMessageDTO[];
}

export interface TestComposeThreadDTO {
  identity: WorkspaceIdentityDTO;
  llm_profile: WorkspaceLLMDTO;
  material_options: IdentityMaterialDTO[];
  draft: {
    subject: string | null;
    body_text: string;
    body_html: string | null;
    selected_material_ids: number[];
  };
  history: Array<{
    id: number;
    recipient_email: string;
    subject: string | null;
    content: string;
    content_html: string | null;
    status: string;
    rfc_message_id: string | null;
    failure_summary: string | null;
    created_at: string;
  }>;
}

export interface TestComposeDraftPayloadDTO {
  subject: string | null;
  body_text: string;
  body_html: string | null;
  selected_material_ids: number[] | null;
}

export interface EmailTaskApprovalPayloadDTO {
  subject: string | null;
  body_text: string;
  body_html: string | null;
  selected_material_ids: number[] | null;
}

export interface EmailTaskOutreachConfigPayloadDTO {
  outreach_generation_mode: OutreachGenerationMode;
  outreach_template_subject?: string | null;
  outreach_template_body_text?: string | null;
  outreach_template_body_html?: string | null;
}

export interface EmailTaskSchedulePayloadDTO extends EmailTaskApprovalPayloadDTO {
  scheduled_at: string;
}

export const PROFESSOR_STATUS_LABELS = {
  discovered: '待处理',
  matched: '待生成',
  review_required: '待审核',
  approved: '待发送',
  scheduled: '已排程',
  sent: '已发送',
  reply_detected: '已回复',
  send_failed: '发送失败',
  canceled: '已取消',
} satisfies Record<WorkspaceTaskStatusLabelKey, string>;

export const BATCH_TASK_STATUS_LABELS: Record<BatchTaskRuntimeStatus, string> = {
  running: '运行中',
  paused: '已暂停',
  stopped: '已中止',
  completed: '已完成',
};

export const MATERIAL_TYPE_LABELS: Record<IdentityMaterialType, string> = {
  resume: '简历',
  transcript: '成绩单',
  publication: '论文',
  portfolio: '作品集',
  other: '其他',
};

export const WORKSPACE_DIRECTION_LABELS: Record<WorkspaceMessageDTO['direction'], string> = {
  draft: '草稿',
  sent: '已发送',
  received: '已收到',
};
