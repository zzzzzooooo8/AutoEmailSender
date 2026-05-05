# 开发者文档

本文面向需要本地运行、调试或打包 Auto Email Sender 的开发者。普通用户请直接下载 Windows 安装版。

## 环境要求

- Node.js
- Python 3.12
- uv
- Git

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

## 本地打包安装包

本地测试 Windows 安装包：

```bash
cd frontend
npm run build

cd ../desktop
npm run dist
```

安装包会生成到 `desktop/release/`。本地打包不会自动发布到 GitHub。
