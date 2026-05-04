import { describe, expect, it } from "vitest";
import { buildMentorFilterOptions } from "@/features/mentor-filter/server/buildMentorFilterOptions";
import { filterMentors } from "@/features/mentor-filter/server/filterMentors";
import { ALL_FILTER_VALUE, type MentorFilterState } from "@/features/mentor-filter/types";
import type { Mentor } from "@/types";

const mentors: Mentor[] = [
  {
    id: "1",
    name: "张明远",
    title: "教授",
    university: "Beta University",
    school: "人工智能学院",
    research: ["Large Language Models", "智能体"],
    matchScore: 92,
    sentCount: 0,
    status: "未发送",
  },
  {
    id: "2",
    name: "Li Wei",
    title: "副教授",
    university: "Alpha University",
    school: "Computer Science",
    research: ["Information Extraction"],
    matchScore: 78,
    sentCount: 2,
    status: "已回复",
  },
  {
    id: "3",
    name: "王教授",
    title: "教授",
    university: "Alpha University",
    school: "人工智能学院",
    research: ["Computer Vision"],
    matchScore: 64,
    sentCount: 1,
    status: "待审核",
  },
];

const defaultFilters = (overrides: Partial<MentorFilterState> = {}): MentorFilterState => ({
  keyword: "",
  universitySchoolPairs: [],
  title: ALL_FILTER_VALUE,
  matchScoreRange: ALL_FILTER_VALUE,
  status: ALL_FILTER_VALUE,
  ...overrides,
});

describe("filterMentors", () => {
  it("returns every mentor when all filters are empty", () => {
    expect(filterMentors(mentors, defaultFilters())).toEqual(mentors);
  });

  it("matches keyword across mentor identity and research fields ignoring case and surrounding spaces", () => {
    const result = filterMentors(mentors, defaultFilters({ keyword: " language " }));

    expect(result.map((mentor) => mentor.id)).toEqual(["1"]);
  });

  it("combines school pairs, title, score range, and status as strict filters", () => {
    const result = filterMentors(
      mentors,
      defaultFilters({
        universitySchoolPairs: [
          { university: "Beta University", school: "人工智能学院" },
          { university: "Alpha University", school: "人工智能学院" },
        ],
        title: "教授",
        matchScoreRange: "90",
        status: "未发送",
      }),
    );

    expect(result.map((mentor) => mentor.id)).toEqual(["1"]);
  });
});

describe("buildMentorFilterOptions", () => {
  it("deduplicates universities, schools, pairs, and titles into sorted option groups", () => {
    const result = buildMentorFilterOptions([
      ...mentors,
      { ...mentors[0], id: "4", name: "重复导师", matchScore: 88 },
    ]);

    expect(result.universities).toEqual(["Alpha University", "Beta University"]);
    expect(result.allSchools).toEqual(["人工智能学院", "Computer Science"]);
    expect(result.schoolsByUniversity).toEqual({
      "Alpha University": ["人工智能学院", "Computer Science"],
      "Beta University": ["人工智能学院"],
    });
    expect(result.universitySchoolOptions).toEqual([
      { university: "Alpha University", school: "人工智能学院" },
      { university: "Alpha University", school: "Computer Science" },
      { university: "Beta University", school: "人工智能学院" },
    ]);
    expect(result.titleOptions).toEqual(["副教授", "教授"]);
  });
});
