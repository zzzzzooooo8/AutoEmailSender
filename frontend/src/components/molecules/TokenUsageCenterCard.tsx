import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Loader2, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { getTokenUsageChart, listTokenUsageRecords } from '@/lib/api/tokenUsage';
import type {
  TokenUsageChartDTO,
  TokenUsageChartPresetDTO,
  TokenUsageRecordDTO,
  TokenUsageRecordFeatureFilterDTO,
  TokenUsageRecordListDTO,
} from '@/types';
import {
  calculateStackedBarSegments,
  formatDateTimeLocalValue,
  formatTokenRecordStatus,
  formatTokenValue,
  getTokenRecordFeatureTone,
  parseDateTimeLocalValue,
  resolveTokenUsagePageJump,
} from '@/features/token-usage/client/tokenUsage';

const PAGE_SIZE = 5;
const defaultFeatureType: TokenUsageRecordFeatureFilterDTO = 'all';
const defaultChartPreset: TokenUsageChartPresetDTO = 'last_24_hours';

interface TokenUsageFiltersState {
  featureType: TokenUsageRecordFeatureFilterDTO;
  startAt: string | null;
  endAt: string | null;
}

const emptyResult: TokenUsageRecordListDTO = {
  records: [],
  summary: {
    input_tokens: 0,
    output_tokens: 0,
    cached_tokens: 0,
    total_tokens: 0,
    record_count: 0,
  },
  pagination: {
    page: 1,
    page_size: PAGE_SIZE,
    total_records: 0,
    total_pages: 0,
  },
};

export function TokenUsageCenterCard() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<TokenUsageRecordListDTO>(emptyResult);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureType, setFeatureType] =
    useState<TokenUsageRecordFeatureFilterDTO>(defaultFeatureType);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [endAt, setEndAt] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [chartPreset, setChartPreset] =
    useState<TokenUsageChartPresetDTO>(defaultChartPreset);
  const [chart, setChart] = useState<TokenUsageChartDTO | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const currentFilters = useMemo(
    () => ({ featureType, startAt, endAt }),
    [endAt, featureType, startAt],
  );

  const loadRecords = useCallback(
    async (nextPage = page, filters: TokenUsageFiltersState = currentFilters) => {
      setLoading(true);
      setError(null);
      try {
        const nextResult = await listTokenUsageRecords({
          page: nextPage,
          pageSize: PAGE_SIZE,
          featureType: filters.featureType,
          startAt: filters.startAt,
          endAt: filters.endAt,
        });
        setResult(nextResult);
        setPage(nextResult.pagination.page);
        setPageInput(String(nextResult.pagination.page));
        setLoaded(true);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '加载 token 消耗记录失败');
      } finally {
        setLoading(false);
      }
    },
    [currentFilters, page],
  );

  const loadChart = useCallback(
    async (
      nextPreset = chartPreset,
      filters: TokenUsageFiltersState = currentFilters,
    ) => {
      setChartLoading(true);
      setChartError(null);
      try {
        setChart(
          await getTokenUsageChart({
            featureType: filters.featureType,
            preset: nextPreset,
            startAt: filters.startAt,
            endAt: filters.endAt,
          }),
        );
        setChartLoaded(true);
      } catch (loadError) {
        setChartError(loadError instanceof Error ? loadError.message : '加载趋势图失败');
      } finally {
        setChartLoading(false);
      }
    },
    [chartPreset, currentFilters],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!loading && !loaded && !error) {
      void loadRecords(1);
    }
    if (!chartLoading && !chartLoaded && !chartError) {
      void loadChart(defaultChartPreset);
    }
  }, [
    chartError,
    chartLoaded,
    chartLoading,
    error,
    loadChart,
    loadRecords,
    loaded,
    loading,
    open,
  ]);

  const handleSearch = () => {
    setPage(1);
    setPageInput('1');
    void loadRecords(1);
    void loadChart(chartPreset);
  };

  const handleReset = () => {
    const resetFilters = {
      featureType: defaultFeatureType,
      startAt: null,
      endAt: null,
    };
    setFeatureType(resetFilters.featureType);
    setStartAt(resetFilters.startAt);
    setEndAt(resetFilters.endAt);
    setChartPreset(defaultChartPreset);
    setPage(1);
    setPageInput('1');
    void loadRecords(1, resetFilters);
    void loadChart(defaultChartPreset, resetFilters);
  };

  const handlePageChange = (nextPage: number) => {
    void loadRecords(nextPage);
  };

  const handlePageJump = () => {
    const nextPage = resolveTokenUsagePageJump(pageInput, result.pagination.total_pages);
    if (nextPage === null) {
      setPageInput(String(page));
      return;
    }
    void loadRecords(nextPage);
  };

  const handlePresetChange = (nextPreset: TokenUsageChartPresetDTO) => {
    setChartPreset(nextPreset);
    void loadChart(nextPreset);
  };

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
              共 {result.summary.record_count.toLocaleString('zh-CN')} 条
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
        <div id="token-usage-center-content" className="space-y-5 px-6 pb-6">
          <TokenUsageFilters
            featureType={featureType}
            startAt={startAt}
            endAt={endAt}
            onFeatureTypeChange={setFeatureType}
            onStartAtChange={setStartAt}
            onEndAtChange={setEndAt}
            onSubmit={handleSearch}
            onReset={handleReset}
          />

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
                onClick={() => void loadRecords(page)}
                className="ui-btn-secondary mt-3 border-red-200 bg-white px-3 py-2 text-xs text-red-700 transition hover:bg-red-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <TokenUsageSummaryGrid result={result} />
              {result.records.length === 0 ? (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                  暂无 token 消耗记录
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-stone-200">
                  {result.records.map((record) => (
                    <TokenUsageRecordRow key={record.id} record={record} />
                  ))}
                </div>
              )}
              <TokenUsagePagination
                page={page}
                totalPages={result.pagination.total_pages}
                pageInput={pageInput}
                onPageInputChange={setPageInput}
                onPageChange={handlePageChange}
                onJump={handlePageJump}
              />
              <TokenUsageTrendChart
                chart={chart}
                preset={chartPreset}
                loading={chartLoading}
                error={chartError}
                onPresetChange={handlePresetChange}
                onRetry={() => void loadChart(chartPreset)}
              />
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function TokenUsageFilters({
  featureType,
  startAt,
  endAt,
  onFeatureTypeChange,
  onStartAtChange,
  onEndAtChange,
  onSubmit,
  onReset,
}: {
  featureType: TokenUsageRecordFeatureFilterDTO;
  startAt: string | null;
  endAt: string | null;
  onFeatureTypeChange: (value: TokenUsageRecordFeatureFilterDTO) => void;
  onStartAtChange: (value: string | null) => void;
  onEndAtChange: (value: string | null) => void;
  onSubmit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50/70 p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="block">
        <span className="mb-2 block text-xs font-medium text-stone-500">功能筛选</span>
        <select
          aria-label="功能筛选"
          value={featureType}
          onChange={(event) =>
            onFeatureTypeChange(event.target.value as TokenUsageRecordFeatureFilterDTO)
          }
          className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-700"
        >
          <option value="all">全部功能</option>
          <option value="crawl">智能爬取</option>
          <option value="match_analysis">匹配分析</option>
          <option value="draft_generation">AI 草稿</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-xs font-medium text-stone-500">开始时间</span>
        <input
          type="datetime-local"
          value={formatDateTimeLocalValue(startAt)}
          onChange={(event) => onStartAtChange(parseDateTimeLocalValue(event.target.value))}
          className="h-10 w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-700"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs font-medium text-stone-500">结束时间</span>
        <input
          type="datetime-local"
          value={formatDateTimeLocalValue(endAt)}
          onChange={(event) => onEndAtChange(parseDateTimeLocalValue(event.target.value))}
          className="h-10 w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-700"
        />
      </label>
      <div className="flex items-end gap-2">
        <button type="button" onClick={onSubmit} className="ui-btn-primary h-10 px-3">
          <Search className="h-4 w-4" />
          查询
        </button>
        <button type="button" onClick={onReset} className="ui-btn-secondary h-10 px-3">
          <RotateCcw className="h-4 w-4" />
          重置
        </button>
      </div>
    </div>
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

function TokenUsagePagination({
  page,
  totalPages,
  pageInput,
  onPageInputChange,
  onPageChange,
  onJump,
}: {
  page: number;
  totalPages: number;
  pageInput: string;
  onPageInputChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onJump: () => void;
}) {
  if (totalPages <= 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-stone-600">
      <button
        type="button"
        className="ui-btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        上一页
      </button>
      <span>第 {page} / {totalPages} 页</span>
      <input
        aria-label="跳转页号"
        type="number"
        min={1}
        max={totalPages}
        value={pageInput}
        onChange={(event) => onPageInputChange(event.target.value)}
        className="h-9 w-20 rounded-xl border border-stone-200 px-3 text-sm"
      />
      <button type="button" className="ui-btn-primary px-3 py-1.5 text-sm" onClick={onJump}>
        跳转
      </button>
      <button
        type="button"
        className="ui-btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}

function TokenUsageTrendChart({
  chart,
  preset,
  loading,
  error,
  onPresetChange,
  onRetry,
}: {
  chart: TokenUsageChartDTO | null;
  preset: TokenUsageChartPresetDTO;
  loading: boolean;
  error: string | null;
  onPresetChange: (value: TokenUsageChartPresetDTO) => void;
  onRetry: () => void;
}) {
  const maxTotal = Math.max(
    ...(chart?.buckets.map((bucket) => bucket.input_tokens + bucket.output_tokens) ?? [0]),
    0,
  );
  return (
    <section className="border-t border-stone-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-stone-900">输入 / 输出趋势</h3>
        <div className="flex flex-wrap gap-2">
          {chartPresetOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onPresetChange(option.value)}
              className={clsx(
                'rounded-xl border px-3 py-1.5 text-xs font-medium transition',
                preset === option.value
                  ? 'border-primary bg-primary text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-8 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载趋势图...
        </div>
      ) : error ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {error}
          <button type="button" className="ml-3 underline" onClick={onRetry}>
            重试
          </button>
        </div>
      ) : chart === null || chart.buckets.length === 0 || maxTotal === 0 ? (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
          暂无趋势数据
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200 bg-[#fcfbf8] px-4 py-4">
          <div className="flex min-w-max items-end gap-3">
            {chart.buckets.map((bucket) => {
              const segments = calculateStackedBarSegments({
                inputTokens: bucket.input_tokens,
                outputTokens: bucket.output_tokens,
                maxTotalTokens: maxTotal,
              });
              return (
                <div key={bucket.bucket_start} className="flex w-12 flex-col items-center gap-2">
                  <div
                    aria-label={`${bucket.bucket_label} 输入 ${bucket.input_tokens} 输出 ${bucket.output_tokens}`}
                    className="flex h-36 w-7 flex-col justify-end overflow-hidden rounded-t-lg bg-stone-200"
                    title={`输入 ${bucket.input_tokens.toLocaleString('zh-CN')} / 输出 ${bucket.output_tokens.toLocaleString('zh-CN')}`}
                  >
                    <div
                      style={{ height: `${segments.outputPercent}%` }}
                      className="w-full bg-sky-500"
                    />
                    <div
                      style={{ height: `${segments.inputPercent}%` }}
                      className="w-full bg-emerald-500"
                    />
                  </div>
                  <span className="text-[11px] text-stone-500">{bucket.bucket_label}</span>
                </div>
              );
            })}
            <div className="ml-2 self-start text-xs leading-6 text-stone-500">
              <div>
                <span className="text-emerald-600">■</span> 输入
              </div>
              <div>
                <span className="text-sky-600">■</span> 输出
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const chartPresetOptions: Array<{
  value: TokenUsageChartPresetDTO;
  label: string;
}> = [
  { value: 'last_6_hours', label: '最近 6 小时' },
  { value: 'last_24_hours', label: '最近 24 小时' },
  { value: 'last_7_days', label: '最近 7 天' },
  { value: 'custom', label: '自定义范围' },
];
