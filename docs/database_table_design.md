### 1. 学生身份表 (Identity)

记录本地使用者的邮箱配置及发件人信息。

| **字段名 (Field)** | **数据类型 (Type)** | **约束 / 键 (Constraint)**    | **说明 (Description)**        |
| --------------- | --------------- | -------------------------- | --------------------------- |
| `identity_id`   | INTEGER         | PRIMARY KEY, AUTOINCREMENT | 唯一标识，主键                     |
| `student_name`  | VARCHAR(50)     | NOT NULL                   | 学生姓名（用于邮件落款）                |
| `email_address` | VARCHAR(100)    | UNIQUE, NOT NULL           | 发件邮箱（账号唯一标识）                |
| `smtp_password` | VARCHAR(255)    | NOT NULL                   | 邮箱 SMTP 授权码                 |
| `smtp_server`   | VARCHAR(100)    | NOT NULL                   | SMTP 服务器地址（如 `smtp.qq.com`） |
| `smtp_port`     | INTEGER         | NOT NULL, DEFAULT 465      | SMTP 端口号（通常为 465 或 587）     |
| `resume_path`   | VARCHAR(255)    | NULLABLE                   | 默认简历本地路径或 URL               |
| `created_at`    | DATETIME        | DEFAULT CURRENT_TIMESTAMP  | 配置创建时间（用于排序或审计）             |

---

### 2. 导师表 (Tutor)

存储爬取到的导师信息，作为发送目标池。

| **字段名 (Field)** | **数据类型 (Type)** | **约束 / 键 (Constraint)**    | **说明 (Description)**                         |
| --------------- | --------------- | -------------------------- | -------------------------------------------- |
| `tutor_id`      | INTEGER         | PRIMARY KEY, AUTOINCREMENT | 导师唯一标识，主键                                    |
| `name`          | VARCHAR(50)     | NOT NULL                   | 导师姓名                                         |
| `avatar_url`    | VARCHAR(255)    | NULLABLE                   | 导师照片 URL（用于丰富聊天 UI）                          |
| `emails`        | TEXT            | NOT NULL                   | 导师邮箱（存 JSON 数组，如 `["a@edu.cn", "b@edu.cn"]`） |
| `university`    | VARCHAR(100)    | NOT NULL                   | 所属高校                                         |
| `departments`   | TEXT            | NULLABLE                   | 所属院系（存 JSON 数组，应对多院系挂职情况）                    |
| `research_area` | VARCHAR(255)    | NULLABLE                   | 研究方向/标签                                      |
| `bio`           | TEXT            | NULLABLE                   | 个人介绍/履历背景                                    |
| `source_url`    | VARCHAR(500)    | NULLABLE                   | 爬虫抓取来源页面链接                                   |

---

### 3. 批量发送任务表 (Task)

管理每次群发任务的规则、模板和状态。

| **字段名 (Field)**    | **数据类型 (Type)** | **约束 / 键 (Constraint)**    | **说明 (Description)**              |
| ------------------ | --------------- | -------------------------- | --------------------------------- |
| `task_id`          | INTEGER         | PRIMARY KEY, AUTOINCREMENT | 任务唯一标识，主键                         |
| `identity_id`      | INTEGER         | FOREIGN KEY                | 关联 `Identity.identity_id`（发件身份）   |
| `task_name`        | VARCHAR(100)    | NOT NULL                   | 任务名称（如：复旦AI组直发）                   |
| `subject_tmpl`     | VARCHAR(255)    | NOT NULL                   | 邮件主题模板                            |
| `body_tmpl`        | TEXT            | NOT NULL                   | 邮件正文模板（支持变量占位符）                   |
| `attachment_paths` | TEXT            | NULLABLE                   | 附件路径列表（存 JSON 数组，支持多附件）           |
| `daily_start_time` | VARCHAR(10)     | NULLABLE                   | 每日允许发送的起始时间（如 `"09:00"`）          |
| `daily_end_time`   | VARCHAR(10)     | NULLABLE                   | 每日允许发送的截止时间（如 `"18:00"`）          |
| `daily_limit`      | INTEGER         | NULLABLE                   | 每日发送数量上限（防反垃圾邮件风控）                |
| `scheduled_time`   | DATETIME        | NULLABLE                   | 首次计划触发时间（为空表示立即启动）                |
| `status`           | INTEGER         | DEFAULT 0                  | 状态：`0`未开始, `1`执行中, `2`已完成, `3`已暂停 |
| `created_at`       | DATETIME        | DEFAULT CURRENT_TIMESTAMP  | 任务创建时间                            |
| `completed_at`     | DATETIME        | NULLABLE                   | 任务最终完成时间                          |

---

### 4. 任务目标明细表 (Task_Target)

记录某个任务下，针对特定导师的发送进度。

|**字段名 (Field)**|**数据类型 (Type)**|**约束 / 键 (Constraint)**|**说明 (Description)**|
|---|---|---|---|
|`target_id`|INTEGER|PRIMARY KEY, AUTOINCREMENT|明细唯一标识，主键|
|`task_id`|INTEGER|FOREIGN KEY, NOT NULL|关联 `Task.task_id`|
|`tutor_id`|INTEGER|FOREIGN KEY, NOT NULL|关联 `Tutor.tutor_id`|
|`send_status`|INTEGER|DEFAULT 0|发送状态：`0`排队中, `1`成功, `2`失败|
|`error_msg`|TEXT|NULLABLE|发送失败时的具体报错信息（如退信原因）|
|`sent_at`|DATETIME|NULLABLE|实际成功发送的具体时间|

---

### 5. 邮件往来记录表 (Email_Log)

独立于任务之外，客观记录双向邮件流水。

|**字段名 (Field)**|**数据类型 (Type)**|**约束 / 键 (Constraint)**|**说明 (Description)**|
|---|---|---|---|
|`message_id`|INTEGER|PRIMARY KEY, AUTOINCREMENT|消息唯一标识，主键|
|`identity_id`|INTEGER|FOREIGN KEY, NOT NULL|关联 `Identity.identity_id`（你的身份）|
|`tutor_id`|INTEGER|FOREIGN KEY, NOT NULL|关联 `Tutor.tutor_id`（对话的导师）|
|`task_id`|INTEGER|FOREIGN KEY, NULLABLE|关联 `Task.task_id`（导师主动回复或散发邮件时可为空）|
|`direction`|INTEGER|NOT NULL|**邮件方向：`0` = 学生发出(右侧气泡), `1` = 导师回复(左侧气泡)**|
|`subject`|VARCHAR(255)|NULLABLE|单封邮件的主题|
|`content`|TEXT|NOT NULL|邮件内容（用于提取纯文本展示在聊天气泡中）|
|`message_time`|DATETIME|NOT NULL|邮件实际发出或收到的时间|
|`is_read`|INTEGER|DEFAULT 0|是否已读：`0`=未读, `1`=已读（用于侧边栏红点提示）|