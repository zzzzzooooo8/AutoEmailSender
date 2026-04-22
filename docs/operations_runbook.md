# 运行与排障手册

## 1. 本地启动
### 1.1 后端
```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload
```

### 1.2 前端
```bash
cd frontend
npm install
npm run dev
```

## 2. 关键环境变量
参考 `backend/.env.example`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | SQLite 本地文件 | 数据库位置 |
| `DEFAULT_MAIL_DELIVERY_MODE` | `dry_run` | 首次初始化系统设置时使用 |
| `DRAFT_WORKER_INTERVAL_SECONDS` | `10` | 兼容保留，当前未启用 |
| `DISPATCHER_INTERVAL_SECONDS` | `30` | 发送 dispatcher 周期 |
| `IMAP_POLL_INTERVAL_SECONDS` | `300` | 回信检测周期 |
| `LLM_REQUEST_TIMEOUT_SECONDS` | `90` | LLM 请求超时 |
| `SMTP_SEND_TIMEOUT_SECONDS` | `30` | SMTP 超时 |
| `IMAP_LOOKBACK_HOURS` | `72` | IMAP 回溯窗口 |
| `ENABLE_BACKGROUND_WORKERS` | `true` | 测试时可关闭 |

## 3. 首次配置建议
1. 在个人页完成发件身份配置，把 SMTP 和 IMAP 一起确认好。
2. 在个人页上传一份默认材料，并准备一版默认模板。
3. 配置一套 LLM 模型，并完成真实连通性测试。
4. 保持顶部发送模式为 `dry_run`。
5. 导入第一批导师，创建第一批任务。
6. 在工作区先跑通匹配、草稿和本地演练发送。
7. 确认整条流程无误后，再考虑切换到 `live`。

## 4. 切到 Live 前的检查清单
- 身份页 SMTP 测试通过。
- 如果需要回信检测，IMAP 测试通过。
- LLM 测试通过，且 `response_preview` 正常。
- 工作区草稿内容已经人工审核。
- 顶部明确显示当前模式为 `Live`。

## 5. 验证真实发送
1. 把顶部切到 `Live`。
2. 在工作区点击“批准并发送”。
3. 在任务详情里确认：
   - `delivery_mode = live`
   - `status = sent`
   - `last_rfc_message_id` 已写入
4. 收件箱里确认邮件已真实发出。

## 6. 验证回信检测
1. 使用刚刚 `live` 发出的邮件进行真实回复。
2. 等待 IMAP poller 下一轮执行，或缩短 `IMAP_POLL_INTERVAL_SECONDS`。
3. 在工作区确认：
   - 最后一条消息方向为 `received`
   - 任务状态变为 `reply_detected`
   - `is_replied = true`

## 7. 常见问题
### 7.1 LLM 测试失败
- 检查 `api_base_url` 是否是 OpenAI 兼容地址。
- 检查 `api_key` 是否有效。
- 检查模型名是否存在。
- 如果是响应慢的模型或中转服务，适当调大 `LLM_REQUEST_TIMEOUT_SECONDS`。
- 如果服务商不支持标准 `/v1/chat/completions`，当前实现不会兼容。

### 7.2 SMTP 测试失败
- 465 端口默认走 SSL。
- 非 465 端口会尝试 `STARTTLS`。
- 某些邮箱需要“授权码”而不是登录密码。

### 7.3 IMAP 没有检测到回复
- 确认该任务是 `live` 发出，而不是 `dry_run`。
- 确认身份已完整配置 IMAP。
- 确认回复邮件头里能带上 `In-Reply-To` 或 `References`。
- 如果邮件服务商延迟同步，适当增大 `IMAP_LOOKBACK_HOURS`。

### 7.4 任务一直停留在 `discovered`
- 这是正常的，表示你还没有在工作区手动执行“生成匹配与草稿”。
- 如果已经手动执行但仍未推进，检查当前任务是否已选择默认材料。
- 再检查后端日志里是否有 LLM 调用错误。

### 7.5 已排程任务没有发出
- 检查批量任务是否被 `paused` 或 `stopped`。
- 检查 `scheduled_at` 是否已经到点。
- 检查该任务批准时快照的 `delivery_mode`。
