# 开发者文档

本文面向需要本地运行、调试或打包 Auto Email Sender 的开发者。普通用户请直接下载 Windows 安装版。

## 环境要求

- Node.js
- Python 3.12
- uv
- Git

如果你只是想本地跑起来，先准备好一个邮箱的 SMTP/IMAP 授权码，以及一套可用的 OpenAI 兼容 LLM API。推荐优先使用 [DeepSeek API](https://platform.deepseek.com/)，便于快速完成首次联调。

## 首次初始化

Web 版本和桌面端都会使用后端的浏览器自动化能力。首次开发前，请先在 GitHub 上 fork 本仓库，然后克隆你自己的 fork 并进入项目目录：

```powershell
git clone https://github.com/<你的 GitHub 用户名>/AutoEmailSender.git
cd AutoEmailSender
```

请把命令里的 `<你的 GitHub 用户名>` 替换成自己的 GitHub 用户名。如果你使用 SSH，也可以改成自己的 SSH 仓库地址。

然后安装后端依赖和浏览器运行时：

```powershell
.\scripts\install-backend-playwright.ps1
```

该脚本会执行 `uv sync --dev`，并把 Playwright/Patchright 的 Chromium headless shell 下载到 `backend/ms-playwright/`。这个目录是本地构建产物，已被 `.gitignore` 忽略，不需要提交到仓库。

## 本地运行 Web 版本

启动后端：

```powershell
cd backend
uv run alembic upgrade head
uv run python dev_entry.py
```

启动前端：

```powershell
cd frontend
npm install
npm run dev
```

打开 `http://127.0.0.1:5173`。

后端默认会把数据写到仓库根目录下的 `data/`。如果你想把数据放到别的目录，可以通过 `AUTO_EMAIL_SENDER_DATA_DIR` 覆盖。

## 桌面端调试

桌面端基于 Electron。开发模式下不需要手动启动后端，`npm run dev` 会通过 `uv run python desktop_entry.py` 自动拉起后端服务。

调试桌面壳时，需要先启动前端开发服务器：

```powershell
cd frontend
npm install
npm run dev
```

然后在另一个终端启动桌面端：

```powershell
cd desktop
npm install
npm run dev
```

桌面端开发模式会加载 `http://127.0.0.1:5173`，并自动选择一个本地端口启动后端。如果看到 `ERR_CONNECTION_REFUSED`，通常是前端开发服务器没有启动，或端口不是 `5173`。如果后端启动失败，请先确认已经完成“首次初始化”，并且 `backend/ms-playwright/` 存在。

桌面版启动时会把用户数据目录传给后端，因此安装版和源码版的数据默认位置不同。安装版通常落在当前用户的 AppData 目录下。

## 常用配置

- **SMTP/IMAP：** 用于发信和收信，通常要在邮箱服务商后台开启客户端授权或生成授权码。
- **LLM API：** 用于匹配分析和自动写信。只要服务兼容 OpenAI 接口，就能接入。
- **推荐起点：** DeepSeek API，Base URL 填 `https://api.deepseek.com`，模型名可先用 `deepseek-v4-flash`。

## 本地打包安装包

本地测试 Windows 安装包：

```powershell
cd frontend
npm run build

cd ../desktop
npm run dist
```

打包前请先确认已在仓库根目录执行过 `.\scripts\install-backend-playwright.ps1`。桌面端打包会把 `backend/ms-playwright/` 复制到安装包资源目录，否则安装版中的浏览器自动化能力可能无法正常启动。

安装包会生成到 `desktop/release/`。本地打包不会自动发布到 GitHub。
