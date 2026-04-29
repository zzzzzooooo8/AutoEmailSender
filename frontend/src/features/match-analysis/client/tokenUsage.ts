export type TokenUsage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cached_tokens: number | null;
};

const emptyUsage = (): TokenUsage => ({
  prompt_tokens: null,
  completion_tokens: null,
  total_tokens: null,
  cached_tokens: null,
});

const addNullable = (left: number | null, right: number | null): number | null => {
  if (left === null && right === null) return null;
  return (left ?? 0) + (right ?? 0);
};

export const sumTokenUsage = (items: TokenUsage[]): TokenUsage =>
  items.reduce(
    (total, item) => ({
      prompt_tokens: addNullable(total.prompt_tokens, item.prompt_tokens),
      completion_tokens: addNullable(total.completion_tokens, item.completion_tokens),
      total_tokens: addNullable(total.total_tokens, item.total_tokens),
      cached_tokens: addNullable(total.cached_tokens, item.cached_tokens),
    }),
    emptyUsage(),
  );

const formatTokenValue = (value: number | null): string =>
  value === null ? '未返回' : value.toLocaleString('zh-CN');

export const formatTokenUsageDescription = (usage: TokenUsage): string =>
  `输入 ${formatTokenValue(usage.prompt_tokens)} / 输出 ${formatTokenValue(
    usage.completion_tokens,
  )} / 总计 ${formatTokenValue(usage.total_tokens)} / 缓存命中 ${formatTokenValue(
    usage.cached_tokens,
  )}`;

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}
