import type { Mentor } from '@/types';
import type { MentorFilterOptions, UniversitySchoolPair } from '../types';

const sortByChinese = (values: Iterable<string>): string[] =>
  Array.from(values).sort((a, b) => a.localeCompare(b, 'zh-CN'));

export const buildMentorFilterOptions = (mentors: Mentor[]): MentorFilterOptions => {
  const universitySet = new Set<string>();
  const allSchoolSet = new Set<string>();
  const schoolsByUniversityMap = new Map<string, Set<string>>();
  const universitySchoolPairSet = new Set<string>();

  mentors.forEach((mentor) => {
    universitySet.add(mentor.university);
    allSchoolSet.add(mentor.school);

    if (!schoolsByUniversityMap.has(mentor.university)) {
      schoolsByUniversityMap.set(mentor.university, new Set<string>());
    }
    schoolsByUniversityMap.get(mentor.university)?.add(mentor.school);

    universitySchoolPairSet.add(`${mentor.university}\t${mentor.school}`);
  });

  const schoolsByUniversity = Object.fromEntries(
    Array.from(schoolsByUniversityMap.entries()).map(([university, schools]) => [
      university,
      sortByChinese(schools),
    ]),
  );

  const universitySchoolOptions: UniversitySchoolPair[] = Array.from(universitySchoolPairSet)
    .map((pair) => {
      const [university, school] = pair.split('\t');
      return { university, school };
    })
    .sort((a, b) => a.university.localeCompare(b.university, 'zh-CN') || a.school.localeCompare(b.school, 'zh-CN'));

  const titleSet = new Set<string>();
  mentors.forEach((mentor) => titleSet.add(mentor.title));

  return {
    universities: sortByChinese(universitySet),
    allSchools: sortByChinese(allSchoolSet),
    schoolsByUniversity,
    universitySchoolOptions,
    titleOptions: sortByChinese(titleSet),
  };
};
