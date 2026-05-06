import type { CrawlCandidateDTO } from '@/types';

export const getReviewableCandidateIds = (
  candidates: CrawlCandidateDTO[],
): number[] =>
  candidates
    .filter((candidate) => candidate.review_status !== 'rejected')
    .map((candidate) => candidate.id);

export const getReviewableCandidateIdsWithoutEmail = (
  candidates: CrawlCandidateDTO[],
): number[] =>
  candidates
    .filter(
      (candidate) =>
        candidate.review_status !== 'rejected' && !candidate.email?.trim(),
    )
    .map((candidate) => candidate.id);

export const pruneSelectedCandidateIds = (
  selectedCandidateIds: number[],
  candidates: CrawlCandidateDTO[],
): number[] => {
  const reviewableIds = new Set(getReviewableCandidateIds(candidates));

  return selectedCandidateIds.filter((candidateId) =>
    reviewableIds.has(candidateId),
  );
};
