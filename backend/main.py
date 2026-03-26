from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 初始化 FastAPI 实例
app = FastAPI(title="Auto Email Agent API", version="2.0")

# 配置 CORS (虽然前端用了代理，但加上这个配置是好习惯，方便以后扩展)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发阶段允许所有来源，生产环境记得限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 注册一个简单的测试路由
@app.get("/api/ping")
async def ping():
    return {
        "status": "ok",
        "message": "Hello from FastAPI! 核心引擎已启动。",
    }


if __name__ == "__main__":
    # 使用 uvicorn 启动服务，开启热更新
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
