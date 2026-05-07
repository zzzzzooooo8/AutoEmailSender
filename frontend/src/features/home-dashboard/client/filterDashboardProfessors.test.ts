import { describe, expect, it } from "vitest";
import type { ProfessorDashboardItemDTO } from "@/types";
import {
  buildDashboardFilterOptions,
  createDefaultDashboardFilters,
  getActiveDashboardFilterCount,
  filterDashboardProfessors,
  type DashboardFilterState,
} from "./filterDashboardProfessors";

const buildProfessor = (
  overrides: Partial<ProfessorDashboardItemDTO>,
): ProfessorDashboardItemDTO => ({
  id: 1,
  name: "Default",
  email: null,
  title: null,
  university: null,
  school: null,
  department: null,
  research_direction: null,
  recent_papers: [],
  match_score: null,
  sent_count: 0,
  status: "not_contacted",
  ...overrides,
});

const namesFor = (
  professors: ProfessorDashboardItemDTO[],
  overrides: Partial<DashboardFilterState>,
) =>
  filterDashboardProfessors(professors, {
    ...createDefaultDashboardFilters(),
    ...overrides,
  }).map((professor) => professor.name);

describe("filterDashboardProfessors", () => {
  const professors = [
    buildProfessor({
      id: 1,
      name: "Alice",
      title: "教授",
      university: "MIT",
      school: "School of Engineering",
      department: "EECS",
      research_direction: "AI systems",
      match_score: 91,
      status: "ready_to_send",
    }),
    buildProfessor({
      id: 2,
      name: "Bob",
      title: "副教授",
      university: "Stanford",
      school: "School of Medicine",
      department: "Bioengineering",
      research_direction: "Biomedical AI",
      match_score: 76,
      status: "not_contacted",
    }),
    buildProfessor({
      id: 3,
      name: "Carol",
      title: "助理教授",
      university: "MIT",
      school: "AI Institute",
      department: "Robotics",
      research_direction: "Robotics planning",
      match_score: null,
      status: "replied",
    }),
  ];

  it("matches keyword against school, department, title, and research direction", () => {
    expect(namesFor(professors, { keyword: "robotics" })).toEqual(["Carol"]);
    expect(namesFor(professors, { keyword: "School of Medicine" })).toEqual(["Bob"]);
    expect(namesFor(professors, { keyword: "教授" })).toEqual([
      "Alice",
      "Bob",
      "Carol",
    ]);
  });

  it("uses OR within one multi-select group", () => {
    expect(namesFor(professors, { universities: ["MIT", "Stanford"] })).toEqual([
      "Alice",
      "Bob",
      "Carol",
    ]);
  });

  it("uses AND across multi-select groups", () => {
    expect(
      namesFor(professors, {
        universities: ["MIT"],
        schools: ["AI Institute"],
        departments: ["Robotics"],
        titles: ["助理教授"],
        statuses: ["replied"],
      }),
    ).toEqual(["Carol"]);
  });

  it("filters by minimum match score and excludes unscored professors when threshold is set", () => {
    expect(namesFor(professors, { minMatchScore: "80" })).toEqual(["Alice"]);
  });

  it("keeps unscored professors when minimum match score is empty", () => {
    expect(namesFor(professors, { minMatchScore: "" })).toEqual([
      "Alice",
      "Bob",
      "Carol",
    ]);
  });

  it("builds sorted non-empty options", () => {
    const options = buildDashboardFilterOptions([
      ...professors,
      buildProfessor({ id: 4, name: "Empty", university: "", school: null }),
    ]);

    expect(options.universities).toEqual(["MIT", "Stanford"]);
    expect(options.schools).toEqual([
      "AI Institute",
      "School of Engineering",
      "School of Medicine",
    ]);
    expect(options.departments).toEqual(["Bioengineering", "EECS", "Robotics"]);
    expect(options.titles).toEqual(["副教授", "教授", "助理教授"]);
  });

  it("limits school options to the selected universities", () => {
    const options = buildDashboardFilterOptions(professors, {
      ...createDefaultDashboardFilters(),
      universities: ["MIT"],
    });

    expect(options.schools).toEqual(["AI Institute", "School of Engineering"]);
  });

  it("counts active advanced filters", () => {
    expect(
      getActiveDashboardFilterCount({
        ...createDefaultDashboardFilters(),
        universities: ["MIT"],
        titles: ["教授", "副教授"],
        minMatchScore: "80",
      }),
    ).toBe(4);
  });

  it("does not mutate the input array", () => {
    const input = [...professors];
    filterDashboardProfessors(input, {
      ...createDefaultDashboardFilters(),
      universities: ["MIT"],
    });

    expect(input.map((professor) => professor.name)).toEqual([
      "Alice",
      "Bob",
      "Carol",
    ]);
  });
});
