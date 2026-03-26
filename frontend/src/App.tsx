import { useState, useEffect } from "react";

function App() {
  const [backendMessage, setBackendMessage] = useState("正在呼叫后端引擎...");

  useEffect(() => {
    fetch("/api/ping")
      .then((res) => res.json())
      .then((data) => setBackendMessage(data.message))
      .catch((err) =>
        setBackendMessage(
          "连接失败，请检查 FastAPI 是否已启动：" + err.toString(),
        ),
      );
  }, []);

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>🚀 Auto Email Sender v2 控制台</h1>
      <div
        style={{
          padding: "20px",
          backgroundColor: "#f3f4f6",
          borderRadius: "8px",
        }}
      >
        <h3>后端状态诊断：</h3>
        <p style={{ color: "#2563eb", fontWeight: "bold" }}>{backendMessage}</p>
      </div>
    </div>
  );
}

export default App;
