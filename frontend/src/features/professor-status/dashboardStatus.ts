import type { ProfessorDashboardItemDTO } from "@/types";

export type ProfessorDashboardStatusGroup =
  | "not_started"
  | "preparing"
  | "sent"
  | "replied"
  | "needs_attention";

export const PROFESSOR_DASHBOARD_STATUS_GROUP_LABELS: Record<
  ProfessorDashboardStatusGroup,
  string
> = {
  not_started: "未开始",
  preparing: "准备中",
  sent: "已发送",
  replied: "已回复",
  needs_attention: "需处理",
};

export const PROFESSOR_DASHBOARD_STATUS_GROUP_OPTIONS: {
  value: ProfessorDashboardStatusGroup;
  label: string;
}[] = [
  { value: "not_started", label: PROFESSOR_DASHBOARD_STATUS_GROUP_LABELS.not_started },
  { value: "preparing", label: PROFESSOR_DASHBOARD_STATUS_GROUP_LABELS.preparing },
  { value: "sent", label: PROFESSOR_DASHBOARD_STATUS_GROUP_LABELS.sent },
  { value: "replied", label: PROFESSOR_DASHBOARD_STATUS_GROUP_LABELS.replied },
  { value: "needs_attention", label: PROFESSOR_DASHBOARD_STATUS_GROUP_LABELS.needs_attention },
];

export const getProfessorDashboardStatusGroup = (
  status: ProfessorDashboardItemDTO["status"],
): ProfessorDashboardStatusGroup => {
  if (status === "not_contacted") {
    return "not_started";
  }
  if (status === "sent") {
    return "sent";
  }
  if (status === "replied") {
    return "replied";
  }
  if (status === "send_failed" || status === "skipped") {
    return "needs_attention";
  }
  return "preparing";
};
