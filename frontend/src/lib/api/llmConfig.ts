import type { LLMConfig } from '@/types';

const STORAGE_KEY = 'llm_config';

export const loadLLMConfig = (): LLMConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { model: 'openai' };
  } catch {
    return { model: 'openai' };
  }
};

export const saveLLMConfig = (config: LLMConfig): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...config,
    updatedAt: new Date().toISOString(),
  }));
};

export const getLLMConfig = async (): Promise<LLMConfig> => {
  await new Promise((r) => setTimeout(r, 100));
  return loadLLMConfig();
};

export const updateLLMConfig = async (data: Partial<LLMConfig>): Promise<LLMConfig> => {
  await new Promise((r) => setTimeout(r, 200));
  const current = loadLLMConfig();
  const updated = { ...current, ...data };
  saveLLMConfig(updated);
  return updated;
};

export type TestConnectionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export const testOpenAIConnection = async (apiKey: string): Promise<TestConnectionResult> => {
  await new Promise((r) => setTimeout(r, 1000));
  if (!apiKey.startsWith('sk-')) {
    return { ok: false, error: 'API Key 格式不正确，OpenAI Key 应以 sk- 开头' };
  }
  return { ok: true, message: '连接成功！模型响应正常。' };
};

export const testDeepseekConnection = async (apiKey: string): Promise<TestConnectionResult> => {
  await new Promise((r) => setTimeout(r, 1000));
  if (!apiKey.startsWith('sk-')) {
    return { ok: false, error: 'API Key 格式不正确，DeepSeek Key 应以 sk- 开头' };
  }
  return { ok: true, message: '连接成功！DeepSeek 模型响应正常。' };
};
