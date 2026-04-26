import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardProfessorRow } from "@/components/molecules/DashboardProfessorRow";
import type { ProfessorDashboardItemDTO } from "@/types";

const professor: ProfessorDashboardItemDTO = {
  id: 1,
  name: "无研究信息导师",
  email: "prof@example.edu",
  title: "Professor",
  university: "Example University",
  school: "School of AI",
  department: "CS",
  research_direction: null,
  recent_papers: [],
  match_score: null,
  sent_count: 0,
  status: "not_contacted",
};

describe("DashboardProfessorRow", () => {
  it("disables match analysis when research direction and recent papers are both missing", () => {
    render(
      <DashboardProfessorRow
        professor={professor}
        selected={false}
        bulkDisabled={false}
        scoring={false}
        canCalculateMatch={false}
        statusLabel="未联系"
        onToggleSelection={vi.fn()}
        onCalculateMatch={vi.fn()}
        onOpenWorkspace={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "缺少研究信息" })).toBeDisabled();
    expect(screen.queryByText("缺少研究方向或近期论文")).not.toBeInTheDocument();
  });
});
