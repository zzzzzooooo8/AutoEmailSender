# 开发者文档

本文面向需要本地运行、调试或打包 Auto Email Sender 的开发者。普通用户请直接下载 Windows 安装版。

## 环境要求

- Node.js
- Python 3.12
- uv
- Git

如果你只是想本地跑起来，先准备好一个邮箱的 SMTP/IMAP 授权码，以及一套可用的 OpenAI 兼容 LLM API。推荐优先使用 [DeepSeek API](https://platform.deepseek.com/)，便于快速完成首次联调。

## 本地运行 Web 版本

启动后端：

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run python dev_entry.py
```

启动前端：

```bash
cd frontend
npm install
npm run dev
```

打开 `http://127.0.0.1:5173`。

后端默认会把数据写到仓库根目录下的 `data/`。如果你想把数据放到别的目录，可以通过 `AUTO_EMAIL_SENDER_DATA_DIR` 覆盖。

## 桌面端调试

桌面端基于 Electron。调试桌面壳时，需要先启动前端开发服务器：

```bash
cd frontend
npm install
npm run dev
```

然后在另一个终端启动桌面端：

```bash
cd desktop
npm install
npm run dev
```

桌面端开发模式会加载 `http://127.0.0.1:5173`。如果看到 `ERR_CONNECTION_REFUSED`，通常是前端开发服务器没有启动，或端口不是 `5173`。

桌面版启动时会把用户数据目录传给后端，因此安装版和源码版的数据默认位置不同。安装版通常落在当前用户的 AppData 目录下。

## 常用配置

- **SMTP/IMAP：** 用于发信和收信，通常要在邮箱服务商后台开启客户端授权或生成授权码。
- **LLM API：** 用于匹配分析和自动写信。只要服务兼容 OpenAI 接口，就能接入。
- **推荐起点：** DeepSeek API，Base URL 填 `https://api.deepseek.com`，模型名可先用 `deepseek-v4-flash`。

## 本地打包安装包

本地测试 Windows 安装包：

```bash
cd frontend
npm run build

cd ../desktop
npm run dist
```

安装包会生成到 `desktop/release/`。本地打包不会自动发布到 GitHub。
