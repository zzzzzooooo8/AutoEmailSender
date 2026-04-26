import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCrawlJob } from '@/lib/api/crawlJobsApi';
import type { CrawlJobCreatePayloadDTO } from '@/types';

const mockedApiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  apiFetch: mockedApiFetch,
}));

describe('crawlJobsApi', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('creates a crawl job with the expected POST payload', async () => {
    const payload: CrawlJobCreatePayloadDTO = {
      university: '测试大学',
      school: '计算机学院',
      start_url: 'https://example.edu/faculty',
      llm_profile_id: 3,
    };
    const createdJob = {
      id: 1,
      ...payload,
      status: 'queued',
      progress_current: 0,
      progress_total: 0,
      error_message: null,
      created_at: '2026-04-26T10:00:00Z',
      updated_at: '2026-04-26T10:00:00Z',
    };
    mockedApiFetch.mockResolvedValue(createdJob);

    await expect(createCrawlJob(payload)).resolves.toBe(createdJob);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/crawl-jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });
});
