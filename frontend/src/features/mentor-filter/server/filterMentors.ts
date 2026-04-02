import type { Mentor } from '@/types';
import { ALL_FILTER_VALUE, type MentorFilterState } from '../types';

const normalize = (value: string): string => value.trim().toLowerCase();

export const filterMentors = (mentors: Mentor[], filters: MentorFilterState): Mentor[] => {
  const keyword = normalize(filters.keyword);
  const { universitySchoolPairs, title, matchScoreRange, status } = filters;

  return mentors.filter((mentor) => {
    const textMatched =
      keyword.length === 0 ||
      mentor.name.toLowerCase().includes(keyword) ||
      mentor.title.toLowerCase().includes(keyword) ||
      mentor.university.toLowerCase().includes(keyword) ||
      mentor.school.toLowerCase().includes(keyword) ||
      mentor.research.some((item) => item.toLowerCase().includes(keyword));

    const pairMatched =
      universitySchoolPairs.length === 0 ||
      universitySchoolPairs.some((pair) => pair.university === mentor.university && pair.school === mentor.school);

    const titleMatched = title === ALL_FILTER_VALUE || mentor.title === title;

    const matchScoreMatched =
      matchScoreRange === ALL_FILTER_VALUE || mentor.matchScore >= parseInt(matchScoreRange, 10);

    const statusMatched = status === ALL_FILTER_VALUE || mentor.status === status;

    return textMatched && pairMatched && titleMatched && matchScoreMatched && statusMatched;
  });
};
