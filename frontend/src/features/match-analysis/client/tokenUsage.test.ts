import { describe, expect, it } from 'vitest';
import {
  formatTokenUsageDescription,
  runWithConcurrency,
  sumTokenUsage,
} from './tokenUsage';

describe('tokenUsage', () => {
  it('sums nullable usage fields', () => {
    const usage = sumTokenUsage([
      { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, cached_tokens: 4 },
      { prompt_tokens: null, completion_tokens: 3, total_tokens: 3, cached_tokens: null },
    ]);

    expect(usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      cached_tokens: 4,
    });
  });

  it('formats missing fields as not returned', () => {
    const description = formatTokenUsageDescription({
      prompt_tokens: null,
      completion_tokens: 5,
      total_tokens: null,
      cached_tokens: 2,
    });

    expect(description).toBe('输入 未返回 / 输出 5 / 总计 未返回 / 缓存命中 2');
  });

  it('limits concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5];

    const results = await runWithConcurrency(items, 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return item * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
