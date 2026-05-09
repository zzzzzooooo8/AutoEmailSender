import type { ProfessorDashboardItemDTO, ProfessorDashboardStatus } from "@/types";

export type ProfessorDashboardStatusFilter = "all" | ProfessorDashboardStatus;

export const PROFESSOR_DASHBOARD_STATUS_LABELS: Record<ProfessorDashboardStatus, string> = {
  not_contacted: "未开始",
  preparing: "准备中",
  ready_to_send: "待发送",
  contacted: "已联系",
  replied: "已回复",
  failed: "失败",
};

export const PROFESSOR_DASHBOARD_STATUS_OPTIONS = Object.entries(
  PROFESSOR_DASHBOARD_STATUS_LABELS,
) as Array<[ProfessorDashboardStatus, string]>;

export const filterProfessorsByDashboardStatus = (
  professors: ProfessorDashboardItemDTO[],
  status: ProfessorDashboardStatusFilter,
): ProfessorDashboardItemDTO[] => {
  if (status === "all") {
    return professors;
  }
  return professors.filter((professor) => professor.status === status);
};

export const getProfessorDashboardStatusLabel = (
  status: ProfessorDashboardStatus,
): string => PROFESSOR_DASHBOARD_STATUS_LABELS[status];
