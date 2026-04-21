# 真实发信与真实 LLM 实现说明

## 1. 后端模块
### 1.1 模型与迁移
- 新增 `app_settings`
- 扩展 `email_tasks`
  - `delivery_mode`
  - `fit_points`
  - `risk_points`
  - `match_keywords`
  - `approved_subject`
  - `approved_body_text`
  - `approved_body_html`
  - `last_send_attempt_at`
  - `last_rfc_message_id`
  - `retry_count`
- 扩展 `email_logs`
  - `delivery_mode`
  - `content_html`
  - `rfc_message_id`
  - `provider_payload`
  - `failure_summary`
  - `reply_headers`

### 1.2 服务层
- `app/services/llm_runtime.py`
  - 负责 LLM 健康检查
  - 负责真实 `chat/completions` 调用
  - 负责结构化 JSON 解析
  - 负责 token 用量解析与估算
- `app/services/mail_runtime.py`
  - 负责 SMTP 连接测试
  - 负责 IMAP 连接测试
  - 负责真实 MIME 邮件构造与发送
  - 负责 IMAP 收件箱抓取与解析
- `app/services/task_runtime.py`
  - 负责手动草稿生成
  - 负责批准并发送 / 排程
  - 负责 dispatcher 消费
  - 负责 IMAP 回信匹配
- `app/services/runtime_manager.py`
  - 负责 FastAPI 生命周期中的发送与回信检测循环

## 2. API 变更
### 2.1 新增系统设置
- `GET /api/system-settings`
- `PATCH /api/system-settings`

响应字段：
```json
{
  "mail_delivery_mode": "dry_run",
  "updated_at": "2026-04-18T18:30:00Z"
}
```

### 2.2 身份测试接口
- `POST /api/identities/{id}/smtp-test`
- `POST /api/identities/{id}/imap-test`

### 2.3 LLM 测试接口
- `POST /api/llm-profiles/{id}/test`

返回：
- `ok`
- `message`
- `resolved_base_url`
- `response_preview`

### 2.4 工作区动作接口
- `POST /api/email-tasks/{id}/regenerate-draft`
- `POST /api/email-tasks/{id}/approve-and-send`
- `POST /api/email-tasks/{id}/approve-and-schedule`
- `POST /api/email-tasks/{id}/cancel-schedule`

其中：
- `approve-and-send` 和 `approve-and-schedule` 不接收前端传入的发送模式
- 后端总是读取当前 `app_settings.mail_delivery_mode`
- 然后写入 `email_tasks.delivery_mode`

## 3. 工作区响应结构
工作区返回值新增：
- `mail_delivery_mode`
- `material_options`
- `current_task.match_reason`
- `current_task.fit_points`
- `current_task.risk_points`
- `current_task.match_keywords`
- `current_task.approved_subject`
- `current_task.approved_body_text`
- `current_task.primary_material_id`
- `current_task.selected_material_ids`
- `current_task.delivery_mode`
- `current_task.last_rfc_message_id`
- `current_task.estimated_prompt_tokens`
- `current_task.estimated_completion_tokens_upper_bound`
- `current_task.estimated_total_tokens_upper_bound`
- `current_task.last_draft_prompt_tokens`
- `current_task.last_draft_completion_tokens`
- `current_task.last_draft_total_tokens`
- `messages[].delivery_mode`
- `messages[].failure_summary`
- `messages[].reply_headers`
- `messages[].prompt_tokens`
- `messages[].completion_tokens`
- `messages[].total_tokens`

## 4. 前端实现点
- `SelectionContext` 统一管理：
  - 身份列表
  - LLM 列表
  - 系统全局发送模式
- 顶部导航提供全局模式切换。
- 任务页按批次展示：
  - 待手动生成
  - 待审核
  - 已排程
  - 已发送
  - 发送失败
  - 已回复
  - Dry Run / Live 快照统计
- 工作区展示：
  - 匹配原因
  - 草稿与发送日志
  - 附件选择
  - 批准并发送
  - 批准并排程

## 5. 测试覆盖
- 数据库升级到 head
- 系统设置默认值为 `dry_run`
- SMTP / IMAP / LLM 测试接口
- 工作区手动触发匹配与草稿生成
- `approve-and-send` 的 `dry_run` 路径
- `approve-and-schedule` 的模式快照
- dispatcher 消费已排程任务
- IMAP 回信把任务推进到 `reply_detected`
