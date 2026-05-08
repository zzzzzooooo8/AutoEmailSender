import { describe, expect, it } from 'vitest';
import type { CrawlCandidateDTO } from '@/types';
import {
  getReviewableCandidateIdsWithoutEmail,
  getReviewableCandidateIds,
  pruneSelectedCandidateIds,
} from './reviewCandidates';

const buildCandidate = (
  overrides: Partial<CrawlCandidateDTO> = {},
): CrawlCandidateDTO => ({
  id: 1,
  job_id: 10,
  professor_id: null,
  name: 'Alice',
  email: 'alice@example.edu',
  title: 'Professor',
  university: 'Test University',
  school: 'Computer Science',
  department: 'AI Lab',
  research_direction: 'LLM',
  recent_papers: ['Paper A'],
  profile_url: 'https://example.edu/alice',
  source_url: 'https://example.edu/faculty/alice',
  confidence: 0.91,
  field_confidence: { email: 0.98 },
  evidence: { source: 'faculty-page' },
  review_status: 'pending',
  created_at: '2026-04-27T10:00:00Z',
  updated_at: '2026-04-27T10:00:00Z',
  ...overrides,
});

describe('reviewCandidates', () => {
  it('returns only pending candidate ids as reviewable', () => {
    const candidates = [
      buildCandidate({ id: 1, review_status: 'pending' }),
      buildCandidate({ id: 2, review_status: 'rejected' }),
      buildCandidate({ id: 3, review_status: 'accepted' }),
      buildCandidate({ id: 4, review_status: 'merged' }),
    ];

    expect(getReviewableCandidateIds(candidates)).toEqual([1]);
  });

  it('returns only pending candidate ids without email', () => {
    const candidates = [
      buildCandidate({ id: 1, email: null, review_status: 'pending' }),
      buildCandidate({ id: 2, email: '', review_status: 'pending' }),
      buildCandidate({ id: 3, email: 'alice@example.edu', review_status: 'pending' }),
      buildCandidate({ id: 4, email: null, review_status: 'accepted' }),
    ];

    expect(getReviewableCandidateIdsWithoutEmail(candidates)).toEqual([1, 2]);
  });

  it('prunes selected ids that no longer exist or are no longer pending', () => {
    const candidates = [
      buildCandidate({ id: 1, review_status: 'pending' }),
      buildCandidate({ id: 2, review_status: 'rejected' }),
      buildCandidate({ id: 3, review_status: 'accepted' }),
      buildCandidate({ id: 4, review_status: 'pending' }),
    ];

    expect(pruneSelectedCandidateIds([4, 3, 2, 999, 1], candidates)).toEqual([4, 1]);
  });
});
