import { apiFetch } from '@/lib/api/client';
import type {
  CrawlCandidateDTO,
  CrawlCandidateUpdatePayloadDTO,
  CrawlJobApproveResultDTO,
  CrawlJobCreatePayloadDTO,
  CrawlJobDTO,
} from '@/types';

export const createCrawlJob = (payload: CrawlJobCreatePayloadDTO) =>
  apiFetch<CrawlJobDTO>('/api/crawl-jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const listCrawlJobs = () => apiFetch<CrawlJobDTO[]>('/api/crawl-jobs');

export const getCrawlJob = (jobId: number) =>
  apiFetch<CrawlJobDTO>(`/api/crawl-jobs/${jobId}`);

export const listCrawlCandidates = (jobId: number) =>
  apiFetch<CrawlCandidateDTO[]>(`/api/crawl-jobs/${jobId}/candidates`);

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
