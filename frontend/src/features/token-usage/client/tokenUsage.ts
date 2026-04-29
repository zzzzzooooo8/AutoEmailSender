import type {
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
