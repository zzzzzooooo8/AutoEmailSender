import type {
  CrawlCandidateDTO,
  CrawlCandidateReviewStatusDTO,
  CrawlCandidateUpdatePayloadDTO,
} from '@/types';

export const getReviewableCandidateIds = (
  candidates: CrawlCandidateDTO[],
): number[] =>
  candidates
    .filter((candidate) => candidate.review_status !== 'rejected')
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

export const buildCandidateReviewPayload = (
  candidate: CrawlCandidateDTO,
  reviewStatus: CrawlCandidateReviewStatusDTO,
): CrawlCandidateUpdatePayloadDTO => ({
  name: candidate.name,
  email: candidate.email,
  title: candidate.title,
  university: candidate.university,
  school: candidate.school,
  department: candidate.department,
  research_direction: candidate.research_direction,
  recent_papers: candidate.recent_papers,
  profile_url: candidate.profile_url,
  source_url: candidate.source_url,
  review_status: reviewStatus,
});
