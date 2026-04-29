import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { listTokenUsageRecords } from '@/lib/api/tokenUsage';
import type { TokenUsageRecordDTO, TokenUsageRecordListDTO } from '@/types';
import {
  formatTokenRecordStatus,
  formatTokenValue,
  getTokenRecordFeatureTone,
} from '@/features/token-usage/client/tokenUsage';

const emptyResult: TokenUsageRecordListDTO = {
  records: [],
  summary: {
    input_tokens: 0,
    output_tokens: 0,
    cached_tokens: 0,
    total_tokens: 0,
    record_count: 0,
  },
};

export function TokenUsageCenterCard() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<TokenUsageRecordListDTO>(emptyResult);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await listTokenUsageRecords(20));
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载 token 消耗记录失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || loading || loaded || error) {
      return;
    }
    void loadRecords();
  }, [error, loadRecords, loaded, loading, open]);

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="token-usage-center-content"
        onClick={() => setOpen((previous) => !previous)}
        className="collapsible-card-toggle flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-stone-50 active:bg-stone-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-stone-900">
              Token 消耗记录中心
            </h2>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
              最近 {result.summary.record_count} 条
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            汇总智能爬取、匹配分析和 AI 草稿的功能级消耗。
          </p>
        </div>
        <ChevronDown
          className={clsx(
            'h-5 w-5 shrink-0 text-stone-500 transition-transform',
            open ? 'rotate-180' : 'rotate-0',
          )}
        />
      </button>

      {open ? (
        <div id="token-usage-center-content" className="px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-8 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载 token 消耗记录...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
              <div>{error}</div>
              <button
                type="button"
                onClick={() => void loadRecords()}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </button>
            </div>
          ) : result.records.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
              暂无 token 消耗记录
            </div>
          ) : (
            <div className="space-y-4">
              <TokenUsageSummaryGrid result={result} />
              <div className="overflow-hidden rounded-2xl border border-stone-200">
                {result.records.map((record) => (
                  <TokenUsageRecordRow key={record.id} record={record} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function TokenUsageSummaryGrid({ result }: { result: TokenUsageRecordListDTO }) {
  const items = [
    ['输入', result.summary.input_tokens],
    ['输出', result.summary.output_tokens],
    ['缓存命中', result.summary.cached_tokens],
    ['总计', result.summary.total_tokens],
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-stone-200 bg-[#fcfbf8] px-4 py-3"
        >
          <div className="text-xs text-stone-500">{label}</div>
          <div className="mt-1 text-lg font-semibold text-stone-900">
            {value.toLocaleString('zh-CN')}
          </div>
        </div>
      ))}
    </div>
  );
}

function TokenUsageRecordRow({ record }: { record: TokenUsageRecordDTO }) {
  const tone = getTokenRecordFeatureTone(record.feature_type);
  return (
    <article className="border-b border-stone-200 bg-white px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={clsx(
                'rounded-full px-2.5 py-1 text-xs font-medium',
                tone === 'amber' && 'bg-amber-100 text-amber-700',
                tone === 'emerald' && 'bg-emerald-100 text-emerald-700',
                tone === 'sky' && 'bg-sky-100 text-sky-700',
                tone === 'stone' && 'bg-stone-100 text-stone-700',
              )}
            >
              {record.feature_label}
            </span>
            <span className="text-xs text-stone-500">
              {formatTokenRecordStatus(record.status)}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-stone-900">
            {record.title}
          </h3>
          <p className="mt-1 text-xs text-stone-500">
            身份：{record.identity_name ?? '未关联'} · 模型：
            {record.model_name ?? '未关联'}
          </p>
        </div>
        <time className="text-xs text-stone-400" dateTime={record.created_at}>
          {new Date(record.created_at).toLocaleString('zh-CN')}
        </time>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-stone-600 sm:grid-cols-4">
        <span>输入 {formatTokenValue(record.input_tokens)}</span>
        <span>输出 {formatTokenValue(record.output_tokens)}</span>
        <span>缓存 {formatTokenValue(record.cached_tokens)}</span>
        <span>总计 {formatTokenValue(record.total_tokens)}</span>
      </div>
    </article>
  );
}
