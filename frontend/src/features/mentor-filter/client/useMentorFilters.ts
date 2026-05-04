import { useMemo, useState } from 'react';
import type { Mentor } from '@/types';
import { buildMentorFilterOptions } from '../server/buildMentorFilterOptions';
import { filterMentors } from '../server/filterMentors';
import {
  ALL_FILTER_VALUE,
  type MentorFilterState,
  type MentorStatusFilter,
  type UniversitySchoolPair,
} from '../types';

const createDefaultFilterState = (): MentorFilterState => ({
  keyword: '',
  universitySchoolPairs: [],
  title: ALL_FILTER_VALUE,
  matchScoreRange: ALL_FILTER_VALUE,
  status: ALL_FILTER_VALUE,
});

export const useMentorFilters = (mentors: Mentor[]) => {
  const [filters, setFilters] = useState<MentorFilterState>(createDefaultFilterState);

  const options = useMemo(() => buildMentorFilterOptions(mentors), [mentors]);

  const filteredMentors = useMemo(() => filterMentors(mentors, filters), [mentors, filters]);

  const setKeyword = (keyword: string) => {
    setFilters((prev) => ({ ...prev, keyword }));
  };

  const toggleUniversitySchoolPair = (pair: UniversitySchoolPair) => {
    setFilters((prev) => {
      const exists = prev.universitySchoolPairs.some(
        (p) => p.university === pair.university && p.school === pair.school,
      );
      if (exists) {
        return {
          ...prev,
          universitySchoolPairs: prev.universitySchoolPairs.filter(
            (p) => !(p.university === pair.university && p.school === pair.school),
          ),
        };
      }
      return {
        ...prev,
        universitySchoolPairs: [...prev.universitySchoolPairs, pair],
      };
    });
  };

  const setTitle = (title: string) => {
    setFilters((prev) => ({ ...prev, title }));
  };

  const setMatchScoreRange = (matchScoreRange: string) => {
    setFilters((prev) => ({ ...prev, matchScoreRange }));
  };

  const setStatus = (status: MentorStatusFilter) => {
    setFilters((prev) => ({ ...prev, status }));
  };

  const resetSchoolAndCollege = () => {
    setFilters((prev) => ({
      ...prev,
      universitySchoolPairs: [],
      title: ALL_FILTER_VALUE,
      matchScoreRange: ALL_FILTER_VALUE,
      status: ALL_FILTER_VALUE,
    }));
  };

  const activeSchoolAndCollegeCount = filters.universitySchoolPairs.length;

  return {
    filters,
    filteredMentors,
    options,
    setKeyword,
    setTitle,
    setMatchScoreRange,
    setStatus,
    toggleUniversitySchoolPair,
    resetSchoolAndCollege,
    activeSchoolAndCollegeCount,
  };
};
