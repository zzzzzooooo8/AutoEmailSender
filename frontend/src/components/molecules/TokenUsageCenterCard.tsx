import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  TransitionEvent as ReactTransitionEvent,
} from 'react';
import clsx from 'clsx';
import { ChevronDown, Loader2, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { NativeSelectField } from '@/components/atoms/NativeSelectField';
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
  formatTokenUsageRecordTime,
  formatTokenValue,
  formatTokenUsageBucketLabel,
  getTokenRecordFeatureTone,
  parseDateTimeLocalValue,
  resolveTokenUsagePageJump,
} from '@/features/token-usage/client/tokenUsage';

const PAGE_SIZE = 5;
const defaultFeatureType: TokenUsageRecordFeatureFilterDTO = 'all';
const defaultChartPreset: TokenUsageChartPresetDTO = 'last_24_hours';
const chartAxisPaddingRatio = 1.08;
const chartAxisNiceSteps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const chartTooltipOffset = 14;
const chartTooltipWidth = 288;
const chartTooltipHeight = 150;
const chartTooltipViewportPadding = 12;

interface TokenUsageFiltersState {
  featureType: TokenUsageRecordFeatureFilterDTO;
  modelName: string | null;
  startAt: string | null;
  endAt: string | null;
}

interface ChartTooltipState {
  bucketStart: string;
  x: number;
  y: number;
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
  model_options: [],
};

export function TokenUsageCenterCard() {
  const [open, setOpen] = useState(false);
  const [renderContent, setRenderContent] = useState(false);
  const [result, setResult] = useState<TokenUsageRecordListDTO>(emptyResult);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureType, setFeatureType] =
    useState<TokenUsageRecordFeatureFilterDTO>(defaultFeatureType);
  const [modelName, setModelName] = useState<string | null>(null);
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
  const showInitialRecordLoading = loading && !loaded;
  const showRecordRefreshing = loading && loaded;

  const currentFilters = useMemo(
    () => ({ featureType, modelName, startAt, endAt }),
    [endAt, featureType, modelName, startAt],
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
          modelName: filters.modelName,
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
            modelName: filters.modelName,
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
    if (!loading && !loaded && !error) {
      void loadRecords(1);
    }
  }, [error, loadRecords, loaded, loading]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!chartLoading && !chartLoaded && !chartError) {
      void loadChart(defaultChartPreset);
    }
  }, [
    chartError,
    chartLoaded,
    chartLoading,
    loadChart,
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
      modelName: null,
      startAt: null,
      endAt: null,
    };
    setFeatureType(resetFilters.featureType);
    setModelName(resetFilters.modelName);
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

  const toggleOpen = () => {
    setOpen((previous) => {
      const nextOpen = !previous;
      if (nextOpen) {
        setRenderContent(true);
      }
      return nextOpen;
    });
  };

  const handleContentTransitionEnd = (
    event: ReactTransitionEvent<HTMLDivElement>,
  ) => {
    if (open || event.propertyName !== 'grid-template-rows') {
      return;
    }
    setRenderContent(false);
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="token-usage-center-content"
        onClick={toggleOpen}
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

      {renderContent ? (
        <div
          id="token-usage-center-content"
          data-state={open ? 'open' : 'closed'}
          onTransitionEnd={handleContentTransitionEnd}
          className="collapsible-card-content"
        >
          <div className="min-h-0 min-w-0 space-y-5 px-6 pb-6">
            <TokenUsageFilters
              featureType={featureType}
              modelName={modelName}
              modelOptions={result.model_options}
              startAt={startAt}
              endAt={endAt}
              onFeatureTypeChange={setFeatureType}
              onModelNameChange={setModelName}
              onStartAtChange={setStartAt}
              onEndAtChange={setEndAt}
              onSubmit={handleSearch}
              onReset={handleReset}
            />

            {showInitialRecordLoading ? (
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
              <div className="min-w-0 space-y-5">
                {showRecordRefreshing ? (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm text-blue-700"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在更新 token 消耗记录...
                  </div>
                ) : null}
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
                  disabled={loading}
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
        </div>
      ) : null}
    </section>
  );
}

function TokenUsageFilters({
  featureType,
  modelName,
  modelOptions,
  startAt,
  endAt,
  onFeatureTypeChange,
  onModelNameChange,
  onStartAtChange,
  onEndAtChange,
  onSubmit,
  onReset,
}: {
  featureType: TokenUsageRecordFeatureFilterDTO;
  modelName: string | null;
  modelOptions: string[];
  startAt: string | null;
  endAt: string | null;
  onFeatureTypeChange: (value: TokenUsageRecordFeatureFilterDTO) => void;
  onModelNameChange: (value: string | null) => void;
  onStartAtChange: (value: string | null) => void;
  onEndAtChange: (value: string | null) => void;
  onSubmit: () => void;
  onReset: () => void;
}) {
  const resolvedModelOptions = modelName
    ? Array.from(new Set([...modelOptions, modelName])).sort()
    : modelOptions;
  return (
    <div className="grid min-w-0 gap-3 rounded-2xl border border-stone-200 bg-stone-50/70 p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <NativeSelectField
        label="功能筛选"
        ariaLabel="功能筛选"
        value={featureType}
        wrapperClassName="block"
        shellClassName="h-10"
        onChange={(event) =>
          onFeatureTypeChange(event.target.value as TokenUsageRecordFeatureFilterDTO)
        }
      >
        <option value="all">全部功能</option>
        <option value="crawl">智能爬取</option>
        <option value="match_analysis">匹配分析</option>
        <option value="draft_generation">AI 草稿</option>
      </NativeSelectField>
      <NativeSelectField
        label="模型筛选"
        ariaLabel="模型筛选"
        value={modelName ?? ''}
        wrapperClassName="block"
        shellClassName="h-10"
        onChange={(event) => onModelNameChange(event.target.value || null)}
      >
        <option value="">全部模型</option>
        {resolvedModelOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelectField>
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
      <div className="flex min-w-0 flex-wrap items-end gap-2 md:col-span-2 xl:col-span-1">
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
          {formatTokenUsageRecordTime({ value: record.created_at })}
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
  disabled = false,
}: {
  page: number;
  totalPages: number;
  pageInput: string;
  onPageInputChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onJump: () => void;
  disabled?: boolean;
}) {
  if (totalPages <= 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-stone-600">
      <button
        type="button"
        className="ui-btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || page <= 1}
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
        disabled={disabled}
        className="h-9 w-20 rounded-xl border border-stone-200 px-3 text-sm"
      />
      <button
        type="button"
        className="ui-btn-primary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={onJump}
      >
        跳转
      </button>
      <button
        type="button"
        className="ui-btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || page >= totalPages}
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
  const [activeBucketStart, setActiveBucketStart] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<ChartTooltipState | null>(null);
  const maxTotal = Math.max(
    ...(chart?.buckets.map((bucket) => bucket.input_tokens + bucket.output_tokens) ?? [0]),
    0,
  );
  const axisMax = resolveChartAxisMax(maxTotal);
  const axisTicks = buildChartAxisTicks(axisMax);
  return (
    <section className="min-w-0 border-t border-stone-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-stone-900">输入 / 输出趋势</h3>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-stone-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#4665f6]" />
              输入tokens
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#96b4ff]" />
              输出tokens
            </span>
          </div>
        </div>
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
        <div className="mt-4 min-w-0 max-w-full overflow-x-auto rounded-2xl border border-stone-200 bg-white px-4 py-5 shadow-sm">
          <div className="min-w-[720px] pl-24 pr-5">
            <div className="relative h-72 border-b border-stone-500">
              {axisTicks.map((tick) => (
                <div
                  key={tick}
                  className={clsx(
                    'absolute left-0 right-0',
                    tick === 0
                      ? 'border-t border-stone-500'
                      : 'border-t border-dashed border-stone-200',
                  )}
                  style={{ bottom: `${(tick / axisMax) * 100}%` }}
                >
                  <span className="absolute right-[calc(100%+0.875rem)] top-0 -translate-y-1/2 whitespace-nowrap text-xs text-stone-500">
                    {formatChartAxisTokenValue(tick)}
                  </span>
                </div>
              ))}
              <div className="relative z-10 flex h-full items-end justify-between gap-6">
                {chart.buckets.map((bucket) => {
                  const bucketLabel = formatTokenUsageBucketLabel({
                    bucketStart: bucket.bucket_start,
                    fallbackLabel: bucket.bucket_label,
                    granularity: chart.granularity,
                  });
                  const totalTokens = bucket.input_tokens + bucket.output_tokens;
                  const segments = calculateStackedBarSegments({
                    inputTokens: bucket.input_tokens,
                    outputTokens: bucket.output_tokens,
                    maxTotalTokens: axisMax,
                  });
                  const inputShare =
                    totalTokens > 0 ? (bucket.input_tokens / totalTokens) * 100 : 0;
                  const outputShare =
                    totalTokens > 0 ? (bucket.output_tokens / totalTokens) * 100 : 0;
                  const totalPercent =
                    totalTokens > 0 ? Math.max(segments.totalPercent, 1.5) : 0;
                  const active = activeBucketStart === bucket.bucket_start;
                  const activeTooltip =
                    active && tooltip?.bucketStart === bucket.bucket_start ? tooltip : null;

                  return (
                    <div
                      key={bucket.bucket_start}
                      className="relative flex h-full min-w-14 flex-1 flex-col items-center justify-end"
                    >
                      {active ? (
                        <div className="pointer-events-none absolute inset-y-0 -left-3 -right-3 bg-[#f4f7ff]" />
                      ) : null}
                      <button
                        type="button"
                        aria-label={`${bucketLabel} 输入 ${bucket.input_tokens} 输出 ${bucket.output_tokens} 总计 ${totalTokens}`}
                        className="relative z-10 flex h-full w-full items-end justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                        onMouseEnter={(event) => {
                          setActiveBucketStart(bucket.bucket_start);
                          setTooltip(createChartTooltipState(bucket.bucket_start, event));
                        }}
                        onMouseMove={(event) => {
                          setTooltip(createChartTooltipState(bucket.bucket_start, event));
                        }}
                        onMouseLeave={() => {
                          setActiveBucketStart(null);
                          setTooltip(null);
                        }}
                        onFocus={() => setActiveBucketStart(bucket.bucket_start)}
                        onBlur={() => {
                          setActiveBucketStart(null);
                          setTooltip(null);
                        }}
                      >
                        <span
                          className="flex w-14 max-w-[80%] min-w-8 flex-col overflow-hidden rounded-t-sm bg-stone-100 shadow-[0_0_0_1px_rgba(70,101,246,0.05)] transition-all"
                          style={{ height: `${totalPercent}%` }}
                        >
                          {bucket.output_tokens > 0 ? (
                            <span
                              className="w-full bg-[#96b4ff]"
                              style={{ height: `${outputShare}%` }}
                            />
                          ) : null}
                          {bucket.input_tokens > 0 ? (
                            <span
                              className="w-full bg-[#4665f6]"
                              style={{ height: `${inputShare}%` }}
                            />
                          ) : null}
                        </span>
                      </button>
                      {activeTooltip ? (
                        <div
                          role="tooltip"
                          className="pointer-events-none fixed z-[80] w-72 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-[0_16px_38px_-16px_rgba(41,37,36,0.38)]"
                          style={{ left: activeTooltip.x, top: activeTooltip.y }}
                        >
                          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                            <span className="font-medium text-stone-500">
                              {bucketLabel}
                            </span>
                            <span className="font-semibold text-stone-900">
                              合计 {formatChartTokenNumber(totalTokens)} tokens
                            </span>
                          </div>
                          <div className="space-y-2 pt-3">
                            <div className="flex items-center justify-between gap-4">
                              <span className="inline-flex items-center gap-2 text-stone-500">
                                <span className="h-2.5 w-2.5 rounded-sm bg-[#4665f6]" />
                                输入tokens
                              </span>
                              <span className="font-semibold text-stone-900">
                                {formatChartTokenNumber(bucket.input_tokens)} tokens
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="inline-flex items-center gap-2 text-stone-500">
                                <span className="h-2.5 w-2.5 rounded-sm bg-[#96b4ff]" />
                                输出tokens
                              </span>
                              <span className="font-semibold text-stone-900">
                                {formatChartTokenNumber(bucket.output_tokens)} tokens
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between gap-6 pt-3">
              {chart.buckets.map((bucket) => (
                <span
                  key={bucket.bucket_start}
                  className="min-w-14 flex-1 text-center text-xs text-stone-500"
                >
                  {formatTokenUsageBucketLabel({
                    bucketStart: bucket.bucket_start,
                    fallbackLabel: bucket.bucket_label,
                    granularity: chart.granularity,
                  })}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function createChartTooltipState(
  bucketStart: string,
  event: ReactMouseEvent<HTMLElement>,
): ChartTooltipState {
  const position = resolveChartTooltipPosition(event.clientX, event.clientY);
  return {
    bucketStart,
    x: position.x,
    y: position.y,
  };
}

function resolveChartTooltipPosition(
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  let x = clientX + chartTooltipOffset;
  let y = clientY + chartTooltipOffset;

  if (
    viewportWidth > 0 &&
    x + chartTooltipWidth + chartTooltipViewportPadding > viewportWidth
  ) {
    x = Math.max(
      chartTooltipViewportPadding,
      clientX - chartTooltipWidth - chartTooltipOffset,
    );
  }
  if (
    viewportHeight > 0 &&
    y + chartTooltipHeight + chartTooltipViewportPadding > viewportHeight
  ) {
    y = Math.max(
      chartTooltipViewportPadding,
      clientY - chartTooltipHeight - chartTooltipOffset,
    );
  }

  return { x: Math.round(x), y: Math.round(y) };
}

function resolveChartAxisMax(maxTotal: number): number {
  if (maxTotal <= 0) {
    return 1;
  }
  const paddedMax = maxTotal * chartAxisPaddingRatio;
  const magnitude = 10 ** Math.floor(Math.log10(paddedMax));
  const normalized = paddedMax / magnitude;
  const step =
    chartAxisNiceSteps.find((candidate) => normalized <= candidate) ?? 10;
  return Math.max(5, Math.ceil(step * magnitude));
}

function buildChartAxisTicks(axisMax: number): number[] {
  return Array.from({ length: 6 }, (_, index) =>
    Math.round((axisMax / 5) * (5 - index)),
  );
}

function formatChartAxisTokenValue(value: number): string {
  return `${formatChartTokenNumber(value)} tokens`;
}

function formatChartTokenNumber(value: number): string {
  return value.toLocaleString('zh-CN');
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
