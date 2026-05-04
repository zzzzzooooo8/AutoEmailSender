import { describe, expect, it } from "vitest";
import type { ProfessorDashboardItemDTO } from "@/types";
import {
  sortDashboardProfessors,
  type ProfessorDashboardSortKey,
} from "./sortDashboardProfessors";

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
  sortKey: ProfessorDashboardSortKey,
  professors: ProfessorDashboardItemDTO[],
) => sortDashboardProfessors(professors, sortKey).map((professor) => professor.name);

describe("sortDashboardProfessors", () => {
  it("keeps backend order for latest import", () => {
    const professors = [
      buildProfessor({ id: 1, name: "First" }),
      buildProfessor({ id: 2, name: "Second" }),
      buildProfessor({ id: 3, name: "Third" }),
    ];

    expect(namesFor("latest", professors)).toEqual(["First", "Second", "Third"]);
  });

  it("sorts by match score descending and places null scores last", () => {
    const professors = [
      buildProfessor({ id: 1, name: "Unscored", match_score: null }),
      buildProfessor({ id: 2, name: "Strong", match_score: 92 }),
      buildProfessor({ id: 3, name: "Medium", match_score: 76 }),
    ];

    expect(namesFor("matchScoreDesc", professors)).toEqual([
      "Strong",
      "Medium",
      "Unscored",
    ]);
  });

  it("sorts by sent count descending", () => {
    const professors = [
      buildProfessor({ id: 1, name: "None", sent_count: 0 }),
      buildProfessor({ id: 2, name: "Many", sent_count: 4 }),
      buildProfessor({ id: 3, name: "One", sent_count: 1 }),
    ];

    expect(namesFor("sentCountDesc", professors)).toEqual(["Many", "One", "None"]);
  });

  it("sorts names ascending", () => {
    const professors = [
      buildProfessor({ id: 1, name: "Zhang" }),
      buildProfessor({ id: 2, name: "Alice" }),
      buildProfessor({ id: 3, name: "Bob" }),
    ];

    expect(namesFor("nameAsc", professors)).toEqual(["Alice", "Bob", "Zhang"]);
  });

  it("does not mutate the input array", () => {
    const professors = [
      buildProfessor({ id: 1, name: "Unscored", match_score: null }),
      buildProfessor({ id: 2, name: "Strong", match_score: 92 }),
    ];

    sortDashboardProfessors(professors, "matchScoreDesc");

    expect(professors.map((professor) => professor.name)).toEqual([
      "Unscored",
      "Strong",
    ]);
  });
});
