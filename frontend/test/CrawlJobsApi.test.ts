import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelCrawlJob,
  createCrawlJob,
  enrichCrawlCandidates,
  getCrawlJob,
  getCrawlJobEvents,
  listCrawlJobs,
  listCrawlPages,
  resumeCrawlJobReview,
} from '@/lib/api/crawlJobsApi';
import type { CrawlJobCreatePayloadDTO, CrawlJobDTO, CrawlJobSummaryDTO } from '@/types';

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
      entry_type: 'profile',
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
    } satisfies CrawlJobDTO;
    mockedApiFetch.mockResolvedValue(createdJob);

    await expect(createCrawlJob(payload)).resolves.toBe(createdJob);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/crawl-jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });

  it('lists crawl jobs from the expected URL', async () => {
    const jobs = [
      {
        id: 1,
        university: '测试大学',
        school: '计算机学院',
        start_url: 'https://example.edu/faculty',
        entry_type: 'list',
        llm_profile_id: 3,
        status: 'running',
        progress_current: 1,
        progress_total: 3,
        page_count: 2,
        candidate_count: 4,
        latest_event_message: '正在抓取教师页面',
        error_message: null,
        created_at: '2026-04-26T10:00:00Z',
        updated_at: '2026-04-26T10:01:00Z',
      },
    ] satisfies CrawlJobSummaryDTO[];
    mockedApiFetch.mockResolvedValue(jobs);

    await expect(listCrawlJobs()).resolves.toBe(jobs);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/crawl-jobs');
  });

  it('gets a crawl job summary from the expected URL', async () => {
    const job = {
      id: 1,
      university: '测试大学',
      school: '计算机学院',
      start_url: 'https://example.edu/faculty',
      entry_type: 'list',
      llm_profile_id: 3,
      status: 'running',
      progress_current: 1,
      progress_total: 3,
      page_count: 2,
      candidate_count: 4,
      latest_event_message: '正在抓取教师页面',
      error_message: null,
      created_at: '2026-04-26T10:00:00Z',
      updated_at: '2026-04-26T10:01:00Z',
    } satisfies CrawlJobSummaryDTO;
    mockedApiFetch.mockResolvedValue(job);

    await expect(getCrawlJob(7)).resolves.toBe(job);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/crawl-jobs/7');
  });

  it('lists crawl pages from the expected job URL', async () => {
    mockedApiFetch.mockResolvedValue([]);

    await listCrawlPages(7);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/crawl-jobs/7/pages');
  });

  it('gets crawl job events from the expected job URL', async () => {
    mockedApiFetch.mockResolvedValue([]);

    await getCrawlJobEvents(7);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/crawl-jobs/7/events');
  });

  it('cancels a crawl job with a base job response', async () => {
    const canceledJob = {
      id: 1,
      university: '测试大学',
      school: '计算机学院',
      start_url: 'https://example.edu/faculty',
      entry_type: 'list',
      llm_profile_id: 3,
      status: 'canceled',
      progress_current: 1,
      progress_total: 3,
      error_message: null,
      created_at: '2026-04-26T10:00:00Z',
      updated_at: '2026-04-26T10:02:00Z',
    } satisfies CrawlJobDTO;
    mockedApiFetch.mockResolvedValue(canceledJob);

    await expect(cancelCrawlJob(7)).resolves.toBe(canceledJob);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/crawl-jobs/7/cancel', {
      method: 'POST',
    });
  });

  it('enriches selected crawl candidates with the expected payload', async () => {
    const result = {
      selected_count: 2,
      enriched_count: 1,
      unchanged_count: 1,
      failed_count: 0,
      message: '补全完成',
    };
    mockedApiFetch.mockResolvedValue(result);

    await expect(enrichCrawlCandidates(7, [11, 12])).resolves.toBe(result);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/crawl-jobs/7/enrich', {
      method: 'POST',
      body: JSON.stringify({ candidate_ids: [11, 12] }),
    });
  });

  it('resumes crawl job review with the expected URL', async () => {
    const job = {
      id: 7,
      university: '测试大学',
      school: '计算机学院',
      start_url: 'https://example.edu/faculty',
      entry_type: 'list',
      llm_profile_id: 3,
      status: 'needs_review',
      progress_current: 0,
      progress_total: 0,
      error_message: null,
      created_at: '2026-04-26T10:00:00Z',
      updated_at: '2026-04-26T10:02:00Z',
    } satisfies CrawlJobDTO;
    mockedApiFetch.mockResolvedValue(job);

    await expect(resumeCrawlJobReview(7)).resolves.toBe(job);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/crawl-jobs/7/resume-review', {
      method: 'POST',
    });
  });
});
