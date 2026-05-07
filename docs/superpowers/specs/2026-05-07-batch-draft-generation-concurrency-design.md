# 批量草稿生成并发设置设计

## 背景

当前系统已经在“其他设置”中提供运行时参数，例如批量匹配分析并发数、智能抓取并发数、AI 草稿输出 token 上限和草稿改写偏好。批量任务会创建多条 `EmailTask`，但没有独立的批量草稿生成 worker，也没有单独的 LLM 草稿生成并发设置。

用户需要在“其他设置”中新增“批量邮件 LLM 生成草稿的并发数”，并且该设置必须真实控制后端批量草稿生成。用户还明确要求：当用户终止批量任务时，后台不能继续运行该批量任务的草稿生成流程。

## 目标

1. 在“其他设置”中新增批量邮件 LLM 草稿生成并发数。
2. 将该设置持久化到 `app_settings`，通过 `/api/runtime-settings` 读写。
3. 新增后端批量草稿生成 worker，按设置值限制并发。
4. 批量任务停止后，不再启动新的草稿生成；已经在本地排队或运行的生成任务应尽快停止，不再写入该批量任务的草稿结果。
5. 继续把 LLM 草稿 token 写入邮件草稿日志和 Token 用量中心；补充操作日志中的 token 诊断信息。

## 非目标

1. 不新增新的前端批量草稿启动按钮。
2. 不重构批量匹配分析 worker。
3. 不承诺取消已经发往远端 LLM 服务的请求后，远端一定停止计算或计费；本地系统只保证停止后不再继续派发、不再持久化已停止批量任务的草稿结果。

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

## 后端运行时

新增服务函数：

`run_queued_batch_drafts_once(session_factory, concurrency: int) -> int`

候选任务选择：

- `EmailTask.source == batch`
- `EmailTask.status in {discovered, matched}`
- 关联 `BatchTask.status == running`
- 按 `BatchTask.created_at`、`EmailTask.created_at`、`EmailTask.id` 稳定排序

执行方式：

- 每轮读取候选任务 id。
- 使用 `asyncio.Semaphore(max(concurrency, 1))` 限制并发。
- 每个任务调用 `generate_task_draft(..., force=False)`。
- 返回本轮实际处理的任务数量，用于运行时循环日志和测试断言。

`RuntimeManager` 新增一个 `batch-draft-worker` 循环：

- 每轮读取最新 `RuntimeSettings`。
- 使用 `batch_draft_generation_concurrency` 调用 `run_queued_batch_drafts_once`。
- 间隔可复用现有 dispatcher 间隔，避免新增过多设置项。

## 停止语义

停止入口仍为：

`POST /api/batch-tasks/{id}/stop`

停止后的行为：

1. `stop` 将批量任务状态置为 `stopped`，并把未完成的子任务标记为 `canceled/batch_stopped`，沿用当前批量任务停止语义。
2. 批量草稿 worker 查询候选任务时只查询 `running` 批量任务，因此停止后不会再派发新任务。
3. 每个草稿生成任务开始前重新加载任务并检查批量任务状态；若不是 `running`，直接跳过。
4. LLM 请求完成后、写入 `EmailLog` 和更新 `EmailTask` 前再次检查批量任务状态；若用户已经停止批量任务，则丢弃本次结果，不写草稿日志，不改成 `review_required`。
5. worker 管理本轮生成任务；当发现批量任务停止或运行时停止信号时，取消尚未完成的本地 `asyncio.Task`，并等待取消收敛。

这保证本地状态不会在用户停止后继续推进。远端 LLM 已接收的请求可能无法被强制撤回，因此需要避免把已停止批量任务的晚到结果落库。

## Token 记录

现状：

- `generate_task_draft()` 已把 LLM usage 写入 `EmailLog.provider_payload.usage`，包含 `prompt_tokens`、`completion_tokens`、`cached_tokens`、`total_tokens`。
- Token 用量中心通过 `token_usage_records.py` 扫描 `EmailLog(direction=draft)`，将带 usage 的草稿日志归类为 `draft_generation`。
- 工作区通过最新草稿 `EmailLog.provider_payload.usage` 展示 `last_draft_*_tokens`。
- 模板模式没有 LLM usage，不计入 AI 草稿 token。

本次补充：

- `email_task.draft_generated` 操作日志 metadata 增加 token 数字，便于诊断日志直接查看。
- 已停止批量任务的晚到 LLM 结果不写 `EmailLog`，因此不会进入 Token 用量中心。若远端已经产生费用但本地取消落库，这是“用户停止后不持久化结果”的取舍。

## 测试计划

后端：

1. `test_runtime_settings_api.py`
   - 默认返回 `batch_draft_generation_concurrency == 3`。
   - PATCH 可保存该字段。
   - 小于 1 或大于 20 返回 422。

2. 新增或扩展批量草稿运行时测试
   - worker 按并发数限制同时运行的 LLM 草稿生成数量。
   - 停止的批量任务不会被选中。
   - 运行中停止后，晚到的 LLM 结果不会写入草稿日志，也不会把任务改成 `review_required`。
   - 模板模式任务仍可通过同一 worker 生成草稿，但不产生 LLM token usage。

3. Token 用量测试
   - 批量 LLM 草稿成功生成后，`EmailLog.provider_payload.usage` 可被 Token 用量中心统计为 `draft_generation`。
   - 操作日志 metadata 包含草稿 token 数字。

前端：

1. `OtherSettingsCard.test.tsx`
   - 加载并展示“批量邮件 LLM 草稿并发数”。
   - 修改后保存 payload 包含 `batch_draft_generation_concurrency`。
   - 摘要显示草稿并发值。

## 验收标准

1. 用户可以在“其他设置”中配置批量邮件 LLM 草稿并发数。
2. 后端批量草稿 worker 按该设置限制并发。
3. 用户停止批量任务后，该批量任务不会继续生成或落库草稿。
4. LLM 草稿 token 继续进入邮件草稿日志、Token 用量中心和汇总。
5. 操作日志可以直接看到草稿 token 数字。
6. 后端相关 unittest 和前端相关 Vitest 通过。
