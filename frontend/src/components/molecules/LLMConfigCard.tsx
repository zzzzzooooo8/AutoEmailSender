import { useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { LLMConfig } from '@/types';
import {
  updateLLMConfig,
  testOpenAIConnection,
  testDeepseekConnection,
  TestConnectionResult,
} from '@/lib/api/llmConfig';

interface LLMConfigCardProps {
  config: LLMConfig;
  onUpdate: (config: LLMConfig) => void;
}

export const LLMConfigCard: React.FC<LLMConfigCardProps> = ({ config, onUpdate }) => {
  const [open, setOpen] = useState(true);
  const [openaiKey, setOpenaiKey] = useState(config.openaiApiKey ?? '');
  const [deepseekKey, setDeepseekKey] = useState(config.deepseekApiKey ?? '');
  const [model, setModel] = useState<LLMConfig['model']>(config.model);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const updated = await updateLLMConfig({
      openaiApiKey: openaiKey,
      deepseekApiKey: deepseekKey,
      model,
    });
    onUpdate(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setTestStatus('loading');
    setTestMessage('');
    let result: TestConnectionResult;

    if (model === 'openai') {
      if (!openaiKey.trim()) {
        setTestStatus('error');
        setTestMessage('请先填写 OpenAI API Key');
        return;
      }
      result = await testOpenAIConnection(openaiKey);
    } else {
      if (!deepseekKey.trim()) {
        setTestStatus('error');
        setTestMessage('请先填写 DeepSeek API Key');
        return;
      }
      result = await testDeepseekConnection(deepseekKey);
    }

    if (result.ok) {
      setTestStatus('success');
      setTestMessage(result.message);
    } else {
      setTestStatus('error');
      setTestMessage(result.error);
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-[#FCFBF8] shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" />
          <span className="font-semibold text-stone-700">模型与网关（LLM & API）</span>
          <span className="text-xs text-stone-400 font-normal">（全局共享）</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-stone-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-stone-400" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-5">
          <p className="text-xs text-stone-400 mb-4">
            配置 AI 模型 API Key，用于智能邮件内容生成与分析。当前支持 OpenAI 和 DeepSeek。
          </p>

          <div className="flex flex-col gap-4">
            {/* 模型选择 */}
            <div>
              <label className="mb-2 block text-xs font-medium text-stone-500">默认模型</label>
              <div className="flex gap-3">
                {(['openai', 'deepseek'] as const).map((m) => (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                      model === m
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="llm-model"
                      value={m}
                      checked={model === m}
                      onChange={() => setModel(m)}
                      className="sr-only"
                    />
                    {m === 'openai' ? '🤖 OpenAI GPT' : '🔮 DeepSeek'}
                  </label>
                ))}
              </div>
            </div>

            {/* OpenAI Key */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-500">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
                className="form-input"
              />
            </div>

            {/* DeepSeek Key */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-500">
                DeepSeek API Key
              </label>
              <input
                type="password"
                value={deepseekKey}
                onChange={(e) => setDeepseekKey(e.target.value)}
                placeholder="sk-..."
                className="form-input"
              />
            </div>

            {/* 操作区 */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleTest}
                disabled={testStatus === 'loading'}
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 transition-all hover:border-stone-300 hover:bg-stone-50 disabled:opacity-60"
              >
                {testStatus === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BrainCircuit className="h-4 w-4" />
                )}
                测试连接
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90"
              >
                {saved ? <CheckCircle className="h-4 w-4" /> : null}
                {saved ? '已保存' : '保存配置'}
              </button>

              {testMessage && (
                <div
                  className={`flex items-center gap-1.5 text-xs font-medium ${
                    testStatus === 'success' ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {testStatus === 'success' ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {testMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
