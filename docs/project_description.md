# Auto Email Sender v2

## 1. 项目定位
本项目是一个面向高校学生（保研 / 出国 / 申博）的开源自动化套磁辅助工具，定位为**单用户、本地自用**的桌面化工作流系统，而不是多人协作平台或营销群发系统。

v2 的核心目标是：在尽量简单部署的前提下，把“找导师 -> 判断匹配度 -> 生成邮件 -> 人工审核 -> 定时发送 -> 跟踪回复”这一整套流程串起来，并保留足够清晰的边界，避免产品目标失控。

**关键业务前提**
- 单用户本地使用，不设计多账号注册、登录、权限系统。
- 单个用户可以维护多个“身份”，每个身份可以有不同的邮箱地址、SMTP/IMAP 配置、简历、署名和附件资源。
- 单个用户也可以维护多套独立的 LLM 配置；运行任务时显式选择“一个身份 + 一套 LLM 配置”。
- 系统只负责生成草稿和辅助发送，**任何邮件都必须在用户人工确认后才能发送**。
- 简历上传支持 PDF / DOCX 解析。
- 邮件默认生成中文内容，是否携带附件由用户在审核阶段自行决定。
- 已读追踪属于**可选功能**，不是系统可靠性的核心依赖。

**核心工作流**
1. 用户创建或选择一个发送身份。
2. 用户选择一套 LLM 配置，并上传该身份对应的简历和附件资源。
3. 用户输入目标院校的教师名录链接或导师列表链接，系统从该入口继续自动爬取导师主页信息。
4. 系统使用所选 LLM 配置分析“当前身份”和“导师信息”的匹配度。
5. 对达到筛选条件的导师生成中文套磁邮件草稿。
6. 用户在前端逐封审核、编辑并确认发送。
7. 调度器按照限制策略异步发送邮件，并持续检查回复情况。
8. 若用户启用公网追踪能力，可额外统计邮件打开情况。

## 2. MVP 范围
### 2.1 本期必须支持
- 单用户本地部署与运行。
- 多身份管理。
- 多套 LLM 配置管理与切换。
- PDF / DOCX 简历上传与文本解析。
- 支持用户提供教师名录或导师列表链接，并从该入口自动识别个人主页。
- 自动提取导师邮箱、研究方向、主页链接等关键信息。
- 基于 LLM 的匹配度评估和邮件草稿生成。
- 用户手动审核后再发送。
- 邮件附件手动选择与发送。
- SMTP 发信、IMAP 回复检查。
- 发送频率限制、失败记录、任务状态管理。
- 可选的已读追踪能力。

### 2.2 本期明确不做
- 多用户账号体系。
- 云端 SaaS 化部署。
- 把通用搜索引擎自动找学校入口页作为必需能力。
- 自动绕过验证码或复杂反爬策略。
- 对图片邮箱做 OCR 识别。
- 对缺少邮箱或缺少研究方向的导师做人工补全流程。
- 未经用户确认的全自动发送。

## 3. 技术栈（严格约束）
- **前端 (Frontend)**: React + Vite + TailwindCSS
- **后端 (Backend)**: FastAPI
- **数据库 (Database)**: SQLite + SQLAlchemy
- **网页自动化 / 爬虫 (Web Automation)**: Playwright
- **大模型框架 (LLM / Agent)**: LangGraph + 任意兼容 OpenAI 格式的 API
- **任务调度 (Task Scheduler)**: APScheduler，直接集成在 FastAPI 进程中，严禁使用 Celery / Redis / RabbitMQ
- **部署方案 (Deployment)**: Docker + Docker Compose

## 4. 核心术语
- **身份 (`IdentityProfile`)**: 用户的一个发送身份，包含邮箱地址、SMTP/IMAP 凭证、简历、署名、附件资源和发送策略。
- **LLM 配置 (`LLMProfile`)**: 一套独立的大模型配置，包含 API 连接信息、模型名及提示词模板。
- **导师线索 (`Professor`)**: 从学校网站上抓取到的一条导师信息。
- **邮件任务 (`EmailTask`)**: 某个身份针对某位导师生成的一次联系任务。
- **附件资源 (`AttachmentAsset`)**: 与身份绑定的附件资源，例如简历、成绩单、代表性论文摘要等；是否随邮件发送由用户逐封决定。

## 5. 建议目录结构（Monorepo）
```text
auto-email-agent/
├── frontend/
│   ├── src/
│   │   ├── components/         # 可复用 UI 组件
│   │   ├── pages/
│   │   │   ├── identities/     # 身份管理
│   │   │   ├── professors/     # 导师线索与筛选结果
│   │   │   ├── tasks/          # 邮件草稿审核与发送任务
│   │   │   └── logs/           # 日志与发送结果
│   │   └── services/           # API 请求封装
├── backend/
│   ├── app/
│   │   ├── api/                # FastAPI 路由层
│   │   ├── core/               # 配置、数据库、日志、密钥读取
│   │   ├── models/             # SQLAlchemy 模型
│   │   ├── schemas/            # Pydantic 模型
│   │   ├── parsers/            # PDF / DOCX 简历解析
│   │   ├── prompts/            # Matcher / Writer 提示词模板
│   │   ├── agents/             # LangGraph + Playwright 核心逻辑
│   │   │   ├── crawler.py      # 搜索入口页、导师列表页与主页抽取
│   │   │   ├── matcher.py      # 身份与导师匹配度评估
│   │   │   └── writer.py       # 邮件草稿生成
│   │   ├── services/
│   │   │   ├── mailer.py       # SMTP 发信
│   │   │   ├── inbox.py        # IMAP 回复检查
│   │   │   └── tracker.py      # 已读追踪接口
│   │   ├── scheduler/          # APScheduler 定时任务
│   │   └── main.py             # 应用入口
├── data/                       # SQLite、上传文件、日志
└── docker-compose.yml
```

## 6. 核心模块与业务逻辑

### 6.1 身份配置与简历解析
**输入**
- 身份名称
- 发信邮箱地址
- SMTP / IMAP 配置
- PDF / DOCX 简历文件
- 附件资源列表
- 默认署名
- 发送策略配置

**处理要求**
1. 每个身份独立保存自己的邮箱配置、简历文本和附件资源。
2. 简历上传后需要解析为可供 LLM 使用的纯文本。
3. 解析失败时必须给出明确错误，而不是静默失败。
4. 邮件生成默认使用中文语气与模板。
5. 用户可以在草稿审核阶段自行选择是否附带某些附件，并可随时增删附件。

**输出**
- 可用于匹配和写作的简历文本
- 身份级附件资源元数据
- 该身份对应的发送策略配置

### 6.2 LLM 配置管理
**输入**
- 配置名称
- API Base URL
- API Key
- 模型名称
- 匹配器提示词模板
- 撰写器提示词模板
- 其他模型参数（如 temperature、max_tokens）

**处理要求**
1. LLM 配置与身份配置彼此独立，不能强耦合在同一张表里。
2. 用户可以维护多套 LLM 配置，并在执行任务前选择其中一套。
3. 每个邮件任务都应记录实际使用的 LLM 配置，保证结果可追溯。
4. 提示词模板允许按配置保存，便于后续替换模型或调参。

**输出**
- 可供任务执行时选择的 `LLMProfile`

### 6.3 Agentic 网页搜索与爬取 (`backend/app/agents/crawler.py`)
**输入**
- 用户提供的目标院校教师名录链接、导师列表链接，或其他明确可作为入口的种子 URL

**处理流程**
1. 以用户提供的入口链接作为起点，而不是依赖搜索引擎全网搜索。
2. 使用 Playwright 加载动态网页，并判断当前页面是否为导师列表页、分页列表页、个人主页或无关页面。
3. 将 DOM 或转换后的 Markdown 文本传递给 LLM，由其辅助识别“导师列表入口”和“个人主页入口”。
4. 逐个访问导师主页，提取字段：`姓名`、`邮箱`、`职称`、`学校`、`院系`、`研究方向`、`近期论文`、`主页链接`、`来源页面`。
5. 将提取结果持久化，并记录爬取状态与跳过原因。

**跳过规则**
- 没有邮箱的导师直接跳过。
- 没有研究方向描述的导师直接跳过。
- 邮箱仅以图片形式存在的导师直接跳过，MVP 不做 OCR。
- 若数据库中已存在相同 `email` 的导师记录，则视为重复数据并直接跳过，不覆盖旧记录。

**约束**
- 必须支持合理等待、重试、超时控制和无头 / 有头模式切换。
- 只处理常规网页结构，不以突破复杂反爬为目标。

### 6.4 匹配度评估 (`backend/app/agents/matcher.py`)
**输入**
- 当前身份的简历文本
- 当前任务选择的 LLM 配置
- 导师的研究方向、近期论文和基础资料

**输出**
- `match_score`: 0-100 分的匹配度
- `match_reason`: 简短说明该分数的原因

**扩展输出（推荐但非强制）**
- `fit_points`: 匹配亮点
- `risk_points`: 不匹配或证据不足的点
- `keywords`: 匹配过程中识别出的研究关键词

**说明**
- `match_score` 表示“当前身份”和“当前导师”的匹配程度，由 LLM 结合简历与导师信息综合判断。
- 系统应支持基于该分数进行筛选，但最终是否发送仍由用户审核决定。

### 6.5 邮件草稿生成与人工审核 (`backend/app/agents/writer.py`)
**输入**
- 当前身份信息
- 当前任务选择的 LLM 配置
- 导师信息
- 匹配结果

**处理要求**
1. 仅对符合筛选条件的导师生成草稿。
2. 生成结果应至少包含：邮件主题、纯文本正文、HTML 正文、建议附件列表。
3. 邮件默认使用中文，措辞应专业、具体，避免模板化和垃圾邮件风格。
4. 草稿生成后任务状态必须进入“待审核”，不能直接进入发送队列。
5. 用户必须能够在前端手动编辑主题、正文和附件，并显式点击确认发送。
6. 附件是否最终带上由用户决定，系统不强制自动勾选。
7. 系统层不主动限制附件大小，但实际发送仍受邮箱服务商限制。

**已读追踪**
- 已读追踪是可选功能。
- 仅当用户配置了可公网访问的域名或 IP 时，系统才可在 HTML 正文末尾插入追踪像素。
- 追踪结果只能视为“可能已打开”的辅助信号，不能视为可靠事实。

### 6.6 调度器与邮件系统 (`backend/app/scheduler/`)
**发信模块**
- 使用 `smtplib` 或 `aiosmtplib`。
- 只能发送已经过人工审核并确认的任务。
- 发信时需要记录完整状态、错误信息和时间戳。
- 不对“同一身份联系同一导师”做系统级冷却限制，是否重复发送由用户自行控制。

**支持配置的限制项**
- 身份级每日发送上限，默认无上限
- 相邻邮件的随机时间间隔，是否启用由用户决定
- 同一收件域名的冷却时间，默认关闭
- 单个任务的失败重试次数，默认 `0`
- 暂停 / 恢复发送能力

**回复检查**
- 使用 `imaplib` 定期检查收件箱。
- 回复识别规则应优先基于发件人邮箱匹配，并尽量结合主题、Message-ID 或退信头信息做关联。
- 自动回复、退信、假期自动回复均算作 `reply_detected`。
- MVP 不区分回复类型，检测到回复后统一将对应任务标记为 `is_replied = True`。

### 6.7 任务状态流转
建议最少包含以下状态：

`discovered` -> `skipped` / `matched` -> `draft_generated` -> `review_required` -> `approved` -> `scheduled` -> `sent` / `send_failed` -> `reply_detected`

**状态说明**
- `discovered`: 已抓取到导师信息，但尚未完成匹配。
- `skipped`: 因缺少邮箱、缺少研究方向或其他规则被跳过。
- `matched`: 已完成匹配打分。
- `draft_generated`: 已生成草稿。
- `review_required`: 等待用户审核。
- `approved`: 用户已确认允许发送。
- `scheduled`: 已进入发送队列。
- `sent`: 已成功发送。
- `send_failed`: 发送失败，等待查看错误或按规则重试。
- `reply_detected`: 已检测到回复，包括自动回复、退信和假期自动回复。

## 7. 数据模型（建议）
考虑到这是单用户本地工具，**不单独设计 `User` 表**。核心表建议如下：

1. `IdentityProfile`（发送身份）
   - `id`
   - `name`
   - `email_address`
   - `smtp_host`
   - `smtp_port`
   - `smtp_username`
   - `smtp_password`
   - `imap_host`
   - `imap_port`
   - `imap_username`
   - `imap_password`
   - `signature`
   - `default_language`
   - `resume_file_path`
   - `resume_text`
   - `match_threshold`
   - `daily_send_limit`
   - `send_interval_min`
   - `send_interval_max`
   - `same_domain_cooldown_minutes`

2. `LLMProfile`（LLM 配置）
   - `id`
   - `name`
   - `api_base_url`
   - `api_key`
   - `model_name`
   - `matcher_prompt_template`
   - `writer_prompt_template`
   - `temperature`
   - `max_tokens`

3. `AttachmentAsset`（附件资源）
   - `id`
   - `identity_id`
   - `file_name`
   - `file_path`
   - `mime_type`

4. `Professor`（导师线索）
   - `id`
   - `name`
   - `email`
   - `title`
   - `university`
   - `school`
   - `department`
   - `research_direction`
   - `recent_papers`
   - `profile_url`
   - `source_url`
   - `crawl_status`
   - `skip_reason`

5. `EmailTask`（邮件任务）
   - `id`
   - `identity_id`
   - `llm_profile_id`
   - `professor_id`
   - `status`
   - `match_score`
   - `match_reason`
   - `generated_subject`
   - `generated_content_text`
   - `generated_content_html`
   - `selected_attachments`
   - `approved_at`
   - `scheduled_at`
   - `sent_at`
   - `is_read`
   - `is_replied`
   - `last_error`

**建模说明**
- `Professor.email` 作为导师去重主键。
- 重复爬取到相同邮箱时直接跳过，不覆盖旧数据。
- 同一 `identity_id + professor_id` 允许存在多条 `EmailTask` 记录，不做唯一约束。

## 8. 边界条件与产品约束
- 本项目是单用户、本地自用工具，不考虑多租户和权限隔离。
- SQLite 可直接以明文形式保存本地配置与凭证，这是当前产品定位下可接受的方案。
- 不同身份之间的邮箱凭证、简历、附件和发送限制彼此独立。
- LLM 配置与身份配置彼此独立，任务运行时由用户分别选择。
- 系统默认生成中文邮件；未来如需英文模板，应视为后续扩展而非当前默认行为。
- 用户需要主动提供目标院校的教师名录或导师列表链接，系统从该入口继续自动爬取。
- 对于缺少有效邮箱、缺少研究方向、或邮箱仅为图片的导师，系统直接跳过。
- 导师按 `email` 去重；重复爬取时直接跳过，不覆盖已有记录。
- 同一身份允许重复联系同一导师，不同身份也允许联系同一导师，是否重复发送由用户自己控制。
- 附件是否发送由用户逐封决定，系统层不设置附件大小上限。
- 已读追踪不是默认强依赖能力；没有公网域名 / IP 时，系统应允许关闭此功能并正常工作。
- 发送限制默认尽量少干预：每日无上限、同域冷却关闭、失败不重试；其他限制项仅在用户显式配置后生效。
- 所有发送行为必须经过用户人工确认，禁止任何“抓取后直接自动群发”的实现。

## 9. AI 开发规范
在为本项目生成代码时，必须严格遵守以下规则：

1. **异步优先**: 对于 FastAPI 路由、Playwright 操作和 HTTP 请求，优先使用 `async def`。
2. **类型提示**: 提供严格的 Python 类型提示，并使用 Pydantic `BaseModel` 处理请求 / 响应校验。
3. **禁用外部消息队列**: 绝对不要引入 Redis、RabbitMQ、Celery。
4. **身份与 LLM 分离建模**: 身份配置与 LLM 配置必须独立建模，任务记录中同时保留 `identity_id` 与 `llm_profile_id`。
5. **审核闸门**: 任何发送逻辑都必须先检查任务状态是否已被用户人工批准。
6. **跳过规则要显式可见**: 对导师被跳过的原因必须落库或出现在前端，不允许静默丢弃。
7. **导师去重要稳定**: 以 `Professor.email` 作为去重依据，重复爬取默认跳过，不做覆盖更新。
8. **错误处理**: Playwright 超时、页面结构变化、LLM API 错误、SMTP / IMAP 失败都不能导致主服务崩溃。
9. **React 最佳实践**: 使用函数式组件和 React Hooks，优先通过 React Context 管理全局配置，避免不必要地引入 Redux。
10. **CORS 配置**: 正确配置 FastAPI 中间件，以支持 Vite 开发环境的跨域请求。
11. **本地优先**: 文件上传、简历解析、配置存储、日志记录都应优先采用本地方案，不以云服务为前提。
