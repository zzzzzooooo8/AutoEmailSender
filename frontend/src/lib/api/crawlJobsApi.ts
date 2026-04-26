import { apiFetch } from '@/lib/api/client';
import type {
  CrawlCandidateDTO,
  CrawlCandidateUpdatePayloadDTO,
  CrawlJobApproveResultDTO,
  CrawlJobCreatePayloadDTO,
  CrawlJobDTO,
  CrawlJobEventDTO,
  CrawlJobSummaryDTO,
  CrawlPageDTO,
} from '@/types';

export const createCrawlJob = (payload: CrawlJobCreatePayloadDTO) =>
  apiFetch<CrawlJobDTO>('/api/crawl-jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const listCrawlJobs = () => apiFetch<CrawlJobSummaryDTO[]>('/api/crawl-jobs');

export const getCrawlJob = (jobId: number) =>
  apiFetch<CrawlJobSummaryDTO>(`/api/crawl-jobs/${jobId}`);

export const listCrawlCandidates = (jobId: number) =>
  apiFetch<CrawlCandidateDTO[]>(`/api/crawl-jobs/${jobId}/candidates`);

export const listCrawlPages = (jobId: number) =>
  apiFetch<CrawlPageDTO[]>(`/api/crawl-jobs/${jobId}/pages`);

export const getCrawlJobEvents = (jobId: number) =>
  apiFetch<CrawlJobEventDTO[]>(`/api/crawl-jobs/${jobId}/events`);

export const updateCrawlCandidate = (
  candidateId: number,
  payload: CrawlCandidateUpdatePayloadDTO,
) =>
  apiFetch<CrawlCandidateDTO>(`/api/crawl-jobs/candidates/${candidateId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const approveCrawlCandidates = (jobId: number, candidateIds: number[]) =>
  apiFetch<CrawlJobApproveResultDTO>(`/api/crawl-jobs/${jobId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ candidate_ids: candidateIds }),
  });

export const cancelCrawlJob = (jobId: number) =>
  apiFetch<CrawlJobDTO>(`/api/crawl-jobs/${jobId}/cancel`, {
    method: 'POST',
  });
