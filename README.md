<div align="center">
  <img src="frontend/public/favicon.svg" alt="Auto Email Sender Logo" width="100" height="100" />
  <h1>Auto Email Sender</h1>
  <p>
    <strong>面向导师套磁场景的智能邮件助手</strong>
  </p>
  <p>
    <a href="https://www.gnu.org/licenses/gpl-3.0">
      <img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License: GPL v3" />
    </a>
    <img src="https://img.shields.io/badge/frontend-React%20%7C%20Vite-61DAFB" alt="Frontend: React | Vite" />
    <img src="https://img.shields.io/badge/backend-FastAPI-009688" alt="Backend: FastAPI" />
    <img src="https://img.shields.io/badge/database-SQLite-003B57" alt="Database: SQLite" />
  </p>
</div>

---

> 从学校官网抓取导师信息，结合 LLM 分析匹配度，再完成草稿审核、定时批量发送和回复追踪。

Auto Email Sender 是一个本地运行的导师联系工具。它把导师抓取、匹配分析、邮件草稿、定时批量发送和回复追踪放在同一个流程里，适合需要批量联系导师、但又不想直接“无脑群发”的场景。

系统会帮你减少重复整理和重复写信的工作，但最终发给谁、什么时候发、发什么内容，仍然由你确认。

## Windows 安装版

普通用户推荐直接下载 Windows 安装版：

1. 打开 [Releases](https://github.com/JunieXD/AutoEmailSender/releases)。
2. 下载最新的 `AutoEmailSender Setup x.y.z.exe`。
3. 双击安装并从桌面快捷方式打开。

安装版会自动启动本地后端，不需要安装 Python、Node.js、uv、npm 或 Git。

第一版安装包暂未购买 Windows 代码签名证书。安装时如果看到「未知发布者」或 SmartScreen 提示，请确认下载来源是本项目 GitHub Releases 页面。

## 界面预览

| 首页 | 工作区 |
| --- | --- |
| <img src="docs/screenshots/首页.png" alt="首页截图" /> | <img src="docs/screenshots/工作区.png" alt="工作区截图" /> |

| 导师管理 | 个人页 |
| --- | --- |
| <img src="docs/screenshots/导师管理页.png" alt="导师管理截图" /> | <img src="docs/screenshots/个人中心.png" alt="个人页截图" /> |

## 核心特点

| 特点 | 说明 |
| --- | --- |
| 智能抓取 | 利用 Agent 从学校官网整理导师信息，减少手动复制和表格维护 |
| 匹配度分析 | 通过 LLM 结合你的材料和导师资料，辅助判断联系优先级 |
| 定时批量发送 | 草稿确认后，可以立即发送，也可以安排到指定时间批量发送 |
| 回复追踪 | 自动检测导师回复，方便后续跟进 |

## 页面概览

| 页面 | 用途 |
| --- | --- |
| 首页 | 筛选导师，创建联系任务 |
| 导师管理 | 抓取、导入和维护导师信息 |
| 任务中心 | 查看批量任务和发送计划 |
| 工作区 | 查看匹配结果，审核草稿并发送 |
| 个人页 | 配置发件身份、材料、模板和邮箱 |
| 测试写信页 | 先给自己发一封测试邮件 |

## 快速开始

启动后端：

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload
```

启动前端：

```bash
cd frontend
npm install
npm run dev
```

打开 `http://127.0.0.1:5173`。

## 发布 Windows 新版本

正式发布分支是 `master`。发布前确保工作区干净，并确认前端、后端和桌面构建验证通过。

运行：

```powershell
rtk pwsh -NoProfile -Command ".\scripts\release.ps1 0.1.1"
```

脚本会更新版本号、创建发布提交、创建 `v0.1.1` tag，并推送到 GitHub。tag 推送后，GitHub Actions 会自动构建 Windows 安装包并创建 Release。

## 技术栈

- 前端：React、Vite、TypeScript、Tailwind CSS
- 后端：FastAPI、SQLAlchemy、Alembic
- 数据库：SQLite
- 邮件：SMTP、IMAP
- 模型：OpenAI 兼容接口

## License

GPL-3.0
