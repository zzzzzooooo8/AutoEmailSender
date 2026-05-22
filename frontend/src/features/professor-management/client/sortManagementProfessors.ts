import type { ProfessorManagementItemDTO } from "@/types";

export type ProfessorManagementSortKey =
  | "latest"
  | "updatedAtDesc"
  | "nameAsc"
  | "universityAsc";

export const PROFESSOR_MANAGEMENT_SORT_OPTIONS: Array<{
  value: ProfessorManagementSortKey;
  label: string;
}> = [
  { value: "latest", label: "最新导入" },
  { value: "updatedAtDesc", label: "最近更新" },
  { value: "nameAsc", label: "姓名 A-Z" },
  { value: "universityAsc", label: "学校 A-Z" },
];

const toTime = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
};

const compareNullableStrings = (
  left: string | null | undefined,
  right: string | null | undefined,
): number => {
  const normalizedLeft = left?.trim() ?? "";
  const normalizedRight = right?.trim() ?? "";

  if (!normalizedLeft && !normalizedRight) {
    return 0;
  }
  if (!normalizedLeft) {
    return 1;
  }
  if (!normalizedRight) {
    return -1;
  }

  return normalizedLeft.localeCompare(normalizedRight, "zh-CN");
};

export const sortManagementProfessors = (
  professors: ProfessorManagementItemDTO[],
  sortKey: ProfessorManagementSortKey,
): ProfessorManagementItemDTO[] => {
  const sorted = [...professors];

  if (sortKey === "updatedAtDesc") {
    return sorted.sort((left, right) => {
      return toTime(right.updated_at) - toTime(left.updated_at);
    });
  }

  if (sortKey === "nameAsc") {
    return sorted.sort((left, right) =>
      left.name.localeCompare(right.name, "zh-CN"),
    );
  }

  if (sortKey === "universityAsc") {
    return sorted.sort((left, right) => {
      const universityDiff = compareNullableStrings(
        left.university,
        right.university,
      );
      if (universityDiff !== 0) {
        return universityDiff;
      }
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }

  return sorted.sort((left, right) => {
    return toTime(right.created_at) - toTime(left.created_at);
  });
};
