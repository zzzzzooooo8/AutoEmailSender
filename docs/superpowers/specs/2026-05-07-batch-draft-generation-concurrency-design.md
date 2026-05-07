# 批量草稿生成并发设置设计

## 背景

当前系统已经在“其他设置”中提供运行时参数，例如批量匹配分析并发数、智能抓取并发数、AI 草稿输出 token 上限和草稿改写偏好。批量任务会创建多条 `EmailTask`，但没有独立的批量草稿生成 worker，也没有单独的 LLM 草稿生成并发设置。

用户需要在“其他设置”中新增“批量邮件 LLM 生成草稿的并发数”，并且该设置必须真实控制后端批量草稿生成。该环节发生在用户创建批量邮件任务之后、真实发送之前。

用户还明确要求：

- 当用户终止批量任务时，后台不能继续运行该批量任务的草稿生成流程。
- 批量草稿生成需要新增“生成中”状态，避免重复生成和并发抢占。
- 模板模式不需要 LLM，不受 LLM 并发设置限制，也不需要用户审核。
- LLM 失败后保留 `last_error`，下一轮不再自动重试，等待用户处理。

## 目标

1. 在“其他设置”中新增批量邮件 LLM 草稿生成并发数。
2. 将该设置持久化到 `app_settings`，通过 `/api/runtime-settings` 读写。
3. 新增后端批量草稿生成 worker，按设置值限制并发。
4. 新增邮件任务的草稿生成中状态，防止同一任务被多个 worker 或手动操作重复生成。
5. 批量任务暂停或停止后，不再启动新的 LLM 草稿生成；已经在本地排队或运行的生成任务由 worker 调用 `cancel()` 并等待取消收敛，不再写入该批量任务的草稿结果。
6. 模板模式批量任务不进入 LLM 草稿生成并发队列，直接渲染模板并进入 `approved` 状态。
7. 继续把 LLM 草稿 token 写入邮件草稿日志和 Token 用量中心；补充操作日志中的 token 诊断信息。

## 非目标

1. 不新增新的前端批量草稿启动按钮。
2. 不重构批量匹配分析 worker。
3. 不承诺取消已经发往远端 LLM 服务的请求后，远端一定停止计算或计费；本地系统只保证停止后不再继续派发、不再持久化已停止批量任务的草稿结果。

## 批量邮件流程

批量邮件创建后分为两条路径：

1. **LLM 模式**
   - 创建批量任务后，子任务先处于待生成状态。
   - 后台 worker 领取任务并进入 `generating_draft` 状态。
   - LLM 生成成功后，任务进入 `review_required`，等待用户审核后再发送。
   - 该路径受 `batch_draft_generation_concurrency` 限制。

2. **模板模式**
   - 创建批量任务后，系统直接使用模板和导师上下文渲染主题、正文和 HTML。
   - 渲染结果写入 `generated_*` 和 `approved_*` 字段，任务进入 `approved` 状态。
   - 如果批量任务是定时发送，仍由批量任务的日期、时间窗口和窗口内发送数量控制实际发送。
   - 模板模式不调用 LLM，不消耗 LLM token，不受 `batch_draft_generation_concurrency` 限制。
   - 模板模式不需要用户审核；用户仍可在工作区后续手动编辑或停止任务。

创建页和任务中心文案需要区分这两条路径，避免用户误解“立即发送”会跳过 LLM 模式的人工审核。

## 设置项

新增字段：`batch_draft_generation_concurrency`

默认值：`3`

取值范围：`1-20`

位置：

- `backend/app/models/app_setting.py`
- `backend/app/schemas/runtime_settings.py`
- `backend/app/services/runtime_settings.py`
- `frontend/src/lib/api/runtimeSettings.ts`
- `frontend/src/components/molecules/OtherSettingsCard.tsx`
- 新增 Alembic migration

前端展示：

- 数字设置区新增“批量邮件 LLM 草稿并发数”。
- 提示文案说明：控制同一轮后台批量草稿生成中同时执行的 LLM 草稿任务数量，保存后下一轮任务生效。
- “其他设置”摘要中加入“草稿并发 N”，避免只显示 token 上限造成歧义。

该设置只影响 LLM 模式。模板模式不调用 LLM，也不占用该并发数。

## 任务状态

新增 `EmailTaskStatus.GENERATING_DRAFT`，持久化值为 `generating_draft`。

为恢复暂停前状态，新增可空字段 `draft_generation_previous_status`，只在任务进入 `generating_draft` 时写入领取前状态。

状态含义：

- 表示该邮件任务已经被批量草稿 worker 领取，正在等待或执行 LLM 草稿生成。
- 该状态只用于 LLM 模式批量任务。
- 手动生成草稿入口遇到该状态时，应拒绝重复生成，并提示“草稿正在后台生成，请稍后刷新”。
- 批量任务暂停或停止时，处于 `generating_draft` 的子任务不应继续推进到 `review_required`。

状态流转：

- LLM 模式：`discovered` 或 `matched` -> `generating_draft` -> `review_required`
- LLM 失败：`generating_draft` -> `draft_failed`
- 批量任务暂停：`generating_draft` -> `discovered` 或 `matched`，保留原始可重试状态
- 批量任务停止：`generating_draft` -> `canceled`，`cancellation_reason = batch_stopped`

新增 `EmailTaskStatus.DRAFT_FAILED`，持久化值为 `draft_failed`。

- 表示自动 LLM 草稿生成已经失败。
- 写入 `last_error`。
- 后续后台 worker 不再自动重试该任务。
- 用户可以在工作区处理错误，例如补充研究方向、修改模板、切换材料后手动重新生成草稿。

## 后端运行时

新增服务函数：

`run_queued_batch_drafts_once(session_factory, concurrency: int) -> int`

候选任务选择：

- `EmailTask.source == batch`
- `EmailTask.status in {discovered, matched}`
- `EmailTask.outreach_generation_mode == llm`
- 关联 `BatchTask.status == running`
- 按 `BatchTask.created_at`、`EmailTask.created_at`、`EmailTask.id` 稳定排序

执行方式：

- 每轮读取候选任务 id，并先把本轮要执行的任务原子领取为 `generating_draft`。
- 使用 `asyncio.Semaphore(max(concurrency, 1))` 限制并发。
- 每个任务调用 `generate_task_draft(..., force=False)`。
- 返回本轮实际处理的任务数量，用于运行时循环日志和测试断言。

领取要求：

- 只有仍处于 `discovered` 或 `matched` 的 LLM 批量任务可以被领取。
- 领取时把任务状态更新为 `generating_draft`，并把领取前状态写入 `draft_generation_previous_status`，用于暂停时恢复为原状态。
- 若任务已经是 `generating_draft`、`review_required`、`draft_failed`、`approved`、`scheduled`、`sent`、`reply_detected` 或 `canceled`，不得再次自动领取。

`RuntimeManager` 新增一个 `batch-draft-worker` 循环：

- 每轮读取最新 `RuntimeSettings`。
- 使用 `batch_draft_generation_concurrency` 调用 `run_queued_batch_drafts_once`。
- 间隔可复用现有 dispatcher 间隔，避免新增过多设置项。

## 暂停与停止语义

暂停和停止入口仍为：

`POST /api/batch-tasks/{id}/pause`

`POST /api/batch-tasks/{id}/stop`

暂停后的行为：

1. `pause` 将批量任务状态置为 `paused`。
2. 批量草稿 worker 查询候选任务时只查询 `running` 批量任务，因此暂停后不会再派发新任务。
3. 已领取但尚未完成的 `generating_draft` 任务由 worker 调用 `cancel()` 并等待取消收敛；若已经发出 LLM 请求，返回后也必须在写入前再次检查批量任务状态。
4. 暂停导致未落库的生成结果应丢弃，任务恢复为领取前状态，方便用户恢复批量任务后继续生成。

停止后的行为：

1. `stop` 将批量任务状态置为 `stopped`，并把未完成的子任务标记为 `canceled/batch_stopped`，沿用当前批量任务停止语义。
2. 批量草稿 worker 查询候选任务时只查询 `running` 批量任务，因此停止后不会再派发新任务。
3. 每个草稿生成任务开始前重新加载任务并检查批量任务状态；若不是 `running`，直接跳过。
4. LLM 请求完成后、写入 `EmailLog` 和更新 `EmailTask` 前再次检查批量任务状态；若用户已经停止批量任务，则丢弃本次结果，不写草稿日志，不改成 `review_required`。
5. worker 管理本轮生成任务；当发现批量任务暂停、停止或运行时停止信号时，取消尚未完成的本地 `asyncio.Task`，并等待取消收敛。

这保证本地状态不会在用户停止后继续推进。远端 LLM 已接收的请求可能无法被强制撤回，因此需要避免把已停止批量任务的晚到结果落库。

## 失败处理

LLM 草稿生成失败后：

- 任务状态从 `generating_draft` 变为 `draft_failed`。
- `last_error` 保留失败原因。
- 后台 worker 后续轮询不再自动重试 `draft_failed` 任务。
- 批量任务卡片和详情需要把 `draft_failed` 计入需要处理的数量，而不是普通待生成数量。
- 用户处理后可以通过现有工作区手动生成草稿入口重新触发；手动触发成功后进入 `review_required`。

## Token 记录

现状：

- `generate_task_draft()` 已把 LLM usage 写入 `EmailLog.provider_payload.usage`，包含 `prompt_tokens`、`completion_tokens`、`cached_tokens`、`total_tokens`。
- Token 用量中心通过 `token_usage_records.py` 扫描 `EmailLog(direction=draft)`，将带 usage 的草稿日志归类为 `draft_generation`。
- 工作区通过最新草稿 `EmailLog.provider_payload.usage` 展示 `last_draft_*_tokens`。
- 模板模式没有 LLM usage，不计入 AI 草稿 token。

本次补充：

- `email_task.draft_generated` 操作日志 metadata 增加 token 数字，便于诊断日志直接查看。
- 已暂停或已停止批量任务的晚到 LLM 结果不写 `EmailLog`，因此不会进入 Token 用量中心。若远端已经产生费用但本地取消落库，这是“用户暂停或停止后不持久化结果”的取舍。

## 测试计划

后端：

1. `test_runtime_settings_api.py`
   - 默认返回 `batch_draft_generation_concurrency == 3`。
   - PATCH 可保存该字段。
   - 小于 1 或大于 20 返回 422。

2. 新增或扩展批量草稿运行时测试
   - worker 按并发数限制同时运行的 LLM 草稿生成数量。
   - worker 领取任务时把任务置为 `generating_draft`，避免重复领取。
   - 手动生成入口遇到 `generating_draft` 时拒绝重复生成。
   - `draft_failed` 任务不会被后台 worker 自动重试。
   - 暂停的批量任务不会被选中。
   - 停止的批量任务不会被选中。
   - 运行中暂停后，晚到的 LLM 结果不会写入草稿日志，也不会把任务改成 `review_required`。
   - 运行中停止后，晚到的 LLM 结果不会写入草稿日志，也不会把任务改成 `review_required`。
   - 模板模式任务不进入 LLM 草稿 worker；创建后直接渲染为可发送内容，不产生 LLM token usage。

3. Token 用量测试
   - 批量 LLM 草稿成功生成后，`EmailLog.provider_payload.usage` 可被 Token 用量中心统计为 `draft_generation`。
   - 操作日志 metadata 包含草稿 token 数字。

前端：

1. `OtherSettingsCard.test.tsx`
   - 加载并展示“批量邮件 LLM 草稿并发数”。
   - 修改后保存 payload 包含 `batch_draft_generation_concurrency`。
   - 摘要显示草稿并发值。

2. 批量任务页面相关测试
   - 详情里能区分“正在生成草稿”和“草稿生成失败”。
   - 暂停和停止后，不再显示该批量任务仍在生成草稿的误导性状态。
   - 模板模式创建文案说明不需要 AI 审核，LLM 模式仍说明需要人工审核。

## 验收标准

1. 用户可以在“其他设置”中配置批量邮件 LLM 草稿并发数。
2. 后端 LLM 批量草稿 worker 按该设置限制并发，模板模式不受该设置影响。
3. `generating_draft` 状态可以防止同一任务被重复自动生成或手动重复生成。
4. 用户暂停或停止批量任务后，该批量任务不会继续生成或落库 LLM 草稿。
5. LLM 自动生成失败后进入 `draft_failed`，保留 `last_error`，后台不再自动重试。
6. 模板模式不调用 LLM，不需要用户审核，创建后直接进入可发送流程。
7. LLM 草稿 token 继续进入邮件草稿日志、Token 用量中心和汇总。
8. 操作日志可以直接看到草稿 token 数字。
9. 后端相关 unittest 和前端相关 Vitest 通过。
