import type {
  TokenUsageChartPresetDTO,
  TokenUsageRecordFeatureFilterDTO,
  TokenUsageRecordFeatureTypeDTO,
  TokenUsageRecordStatusDTO,
} from '@/types';

export type TokenRecordFeatureTone = 'amber' | 'emerald' | 'sky' | 'stone';

export const formatTokenValue = (value: number | null): string =>
  value === null ? '未返回' : value.toLocaleString('zh-CN');

export const formatTokenRecordStatus = (
  status: TokenUsageRecordStatusDTO,
): string => {
  const labels: Record<TokenUsageRecordStatusDTO, string> = {
    success: '成功',
    failed: '失败',
    running: '进行中',
    unknown: '未知',
  };
  return labels[status];
};

export const getTokenRecordFeatureTone = (
  featureType: TokenUsageRecordFeatureTypeDTO,
): TokenRecordFeatureTone => {
  const tones: Record<TokenUsageRecordFeatureTypeDTO, TokenRecordFeatureTone> = {
    crawl: 'amber',
    match_analysis: 'emerald',
    draft_generation: 'sky',
  };
  return tones[featureType] ?? 'stone';
};

export const buildTokenUsageRecordQueryParams = ({
  page,
  pageSize,
  featureType,
  modelName,
  startAt,
  endAt,
}: {
  page: number;
  pageSize: number;
  featureType: TokenUsageRecordFeatureFilterDTO;
  modelName: string | null;
  startAt: string | null;
  endAt: string | null;
}) => ({
  page,
  page_size: pageSize,
  ...(featureType !== 'all' ? { feature_type: featureType } : {}),
  ...(modelName ? { model_name: modelName } : {}),
  ...(startAt ? { start_at: startAt } : {}),
  ...(endAt ? { end_at: endAt } : {}),
});

export const buildTokenUsageChartQueryParams = ({
  featureType,
  modelName,
  preset,
  startAt,
  endAt,
}: {
  featureType: TokenUsageRecordFeatureFilterDTO;
  modelName: string | null;
  preset: TokenUsageChartPresetDTO;
  startAt: string | null;
  endAt: string | null;
}) => ({
  preset,
  ...(featureType !== 'all' ? { feature_type: featureType } : {}),
  ...(modelName ? { model_name: modelName } : {}),
  ...(preset === 'custom' && startAt ? { start_at: startAt } : {}),
  ...(preset === 'custom' && endAt ? { end_at: endAt } : {}),
});

export const parseDateTimeLocalValue = (value: string): string | null => {
  if (!value.trim()) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

export const formatDateTimeLocalValue = (value: string | null): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return [
    date.getFullYear(),
    '-',
    padDatePart(date.getMonth() + 1),
    '-',
    padDatePart(date.getDate()),
    'T',
    padDatePart(date.getHours()),
    ':',
    padDatePart(date.getMinutes()),
  ].join('');
};

export const resolveTokenUsagePageJump = (
  pageInput: string,
  totalPages: number,
): number | null => {
  const nextPage = Number(pageInput);
  if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > totalPages) {
    return null;
  }
  return nextPage;
};

export const calculateStackedBarSegments = ({
  inputTokens,
  outputTokens,
  maxTotalTokens,
}: {
  inputTokens: number;
  outputTokens: number;
  maxTotalTokens: number;
}) => {
  if (maxTotalTokens <= 0) {
    return { inputPercent: 0, outputPercent: 0, totalPercent: 0 };
  }
  const inputPercent = Math.round((inputTokens / maxTotalTokens) * 100);
  const outputPercent = Math.round((outputTokens / maxTotalTokens) * 100);
  return {
    inputPercent,
    outputPercent,
    totalPercent: inputPercent + outputPercent,
  };
};

const padDatePart = (value: number): string => String(value).padStart(2, '0');
