import type { ProfessorDashboardItemDTO } from "@/types";

export type ProfessorDashboardSortKey =
  | "latest"
  | "matchScoreDesc"
  | "sentCountDesc"
  | "nameAsc";

export const PROFESSOR_DASHBOARD_SORT_OPTIONS: Array<{
  value: ProfessorDashboardSortKey;
  label: string;
}> = [
  { value: "latest", label: "最新导入" },
  { value: "matchScoreDesc", label: "匹配度高到低" },
  { value: "sentCountDesc", label: "发送次数高到低" },
  { value: "nameAsc", label: "姓名 A-Z" },
];

export const sortDashboardProfessors = (
  professors: ProfessorDashboardItemDTO[],
  sortKey: ProfessorDashboardSortKey,
): ProfessorDashboardItemDTO[] => {
  const sorted = [...professors];

  if (sortKey === "matchScoreDesc") {
    return sorted.sort(
      (left, right) => (right.match_score ?? -1) - (left.match_score ?? -1),
    );
  }

  if (sortKey === "sentCountDesc") {
    return sorted.sort((left, right) => right.sent_count - left.sent_count);
  }

  if (sortKey === "nameAsc") {
    return sorted.sort((left, right) => left.name.localeCompare(right.name));
  }

  return sorted;
};
