export const getApiProxyTarget = (env: Record<string, string | undefined> = process.env) =>
  env.VITE_API_PROXY_TARGET?.trim() || "http://127.0.0.1:8010";
