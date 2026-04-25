import { describe, expect, it } from "vitest";
import {
  PROFESSOR_DASHBOARD_STATUS_GROUP_LABELS,
  getProfessorDashboardStatusGroup,
} from "@/features/professor-status/dashboardStatus";
import type { ProfessorDashboardItemDTO } from "@/types";

describe("professor dashboard status groups", () => {
  it("keeps homepage-facing status groups concise", () => {
    expect(Object.values(PROFESSOR_DASHBOARD_STATUS_GROUP_LABELS)).toEqual([
      "未开始",
      "准备中",
      "已发送",
      "已回复",
      "需处理",
    ]);
  });

  it.each<[ProfessorDashboardItemDTO["status"], string]>([
    ["not_contacted", "not_started"],
    ["matched", "preparing"],
    ["review_required", "preparing"],
    ["scheduled", "preparing"],
    ["sent", "sent"],
    ["replied", "replied"],
    ["send_failed", "needs_attention"],
    ["skipped", "needs_attention"],
  ])("maps %s to the condensed homepage group %s", (status, expectedGroup) => {
    expect(getProfessorDashboardStatusGroup(status)).toBe(expectedGroup);
  });
});
