# 真实发信与真实 LLM 设计说明

## 1. 目标
把当前系统从“前后端闭环但服务端仍有占位逻辑”提升到“真实 LLM + 真实 SMTP + IMAP 回信检测”的可运行状态，同时保留单机、单进程、低依赖的产品边界。

## 2. 核心设计决策
### 2.1 发送安全
- 系统采用全局发送开关，而不是逐次选择。
- 开关持久化在 `app_settings.mail_delivery_mode`。
- 任务在批准时把当时的模式写入 `email_tasks.delivery_mode`。
- dispatcher 只看任务快照，不看发送当刻的当前全局开关。

### 2.2 真实 LLM
- 统一走 OpenAI 兼容 `chat/completions`。
- 单次草稿生成同时返回匹配结果和草稿 JSON：
  - `match_score`
  - `match_reason`
  - `fit_points`
  - `risk_points`
  - `keywords`
  - `subject`
  - `body_text`
  - `body_html`
  - `suggested_attachment_ids`
- 后端必须做 JSON 解析和结构校验，拒绝把不合法输出直接落库。

### 2.3 真实发信
- `dry_run` 不出网，只写 `email_logs(sent)`。
- `live` 走真实 SMTP，构造 `text/plain + text/html + attachments` 邮件。
- 发信成功后写入 `last_rfc_message_id`，供 IMAP 回信关联。

### 2.4 回信检测
- 只处理 `delivery_mode=live` 且已发送的任务。
- 关联顺序：
  1. `In-Reply-To`
  2. `References`
  3. `from_email + normalized subject`
  4. 同身份下最近一次已发送任务兜底
- 检测到回复后统一标记 `reply_detected`，当前版本不细分“自动回复 / 正常回复 / 退信”。

## 3. 后台运行时
系统不使用 APScheduler / Celery / Redis。当前只有发送与回信检测放在 FastAPI 生命周期里的本地循环中，匹配与草稿生成改为工作区手动触发：

1. 发送 dispatcher
- 读取 `EmailTask.status in (approved, scheduled)`
- 立即发送或按 `scheduled_at` 发送
- 按任务快照的 `delivery_mode` 执行

2. IMAP poller
- 按身份轮询最近若干小时收件箱
- 关联回信并写入 `email_logs(received)`

## 4. 前端交互原则
- 顶部导航展示全局 `Dry Run / Live` 模式。
- 工作区是唯一的任务审批中心：
  - 手动选择用于匹配的默认材料
  - 看匹配原因
  - 手动生成或重新生成匹配与草稿
  - 编辑主题 / 正文 / 附件
  - 批准并发送
  - 批准并排程
  - 取消排程
- 任务页只做批次控制和状态观察，不承担逐封审批。

## 5. 失败处理
- LLM 失败：保留任务，更新 `last_error`，用户可在工作区再次手动触发。
- SMTP 失败：任务进入 `send_failed`，写失败日志。
- IMAP 失败：只记录错误，不让主服务崩溃。
- 任一 worker 异常都不能导致 FastAPI 进程退出。
