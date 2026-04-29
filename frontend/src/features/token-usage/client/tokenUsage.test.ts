import { describe, expect, it } from 'vitest';
import {
  formatTokenRecordStatus,
  formatTokenValue,
  getTokenRecordFeatureTone,
} from './tokenUsage';

describe('token usage center helpers', () => {
  it('formats missing token fields as not returned', () => {
    expect(formatTokenValue(null)).toBe('未返回');
    expect(formatTokenValue(1200)).toBe('1,200');
  });

  it('formats record status labels', () => {
    expect(formatTokenRecordStatus('success')).toBe('成功');
    expect(formatTokenRecordStatus('failed')).toBe('失败');
    expect(formatTokenRecordStatus('running')).toBe('进行中');
    expect(formatTokenRecordStatus('unknown')).toBe('未知');
  });

  it('returns stable visual tones for feature types', () => {
    expect(getTokenRecordFeatureTone('crawl')).toBe('amber');
    expect(getTokenRecordFeatureTone('match_analysis')).toBe('emerald');
    expect(getTokenRecordFeatureTone('draft_generation')).toBe('sky');
  });
});
