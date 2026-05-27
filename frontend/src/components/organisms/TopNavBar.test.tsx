import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopNavBar } from "@/components/organisms/TopNavBar";

vi.mock("@/components/molecules/DesktopUpdateButton", () => ({
  DesktopUpdateButton: () => null,
}));

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: () => ({
    identities: [],
    llmProfiles: [],
    selectedIdentityId: null,
    selectedLlmProfileId: null,
    setSelectedIdentityId: vi.fn(),
    setSelectedLlmProfileId: vi.fn(),
    loading: false,
  }),
}));

describe("TopNavBar", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("includes the statistics panel navigation entry", () => {
    render(
      <MemoryRouter>
        <TopNavBar />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "统计面板" });
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("places the statistics panel before profile in the main navigation order", () => {
    render(
      <MemoryRouter>
        <TopNavBar />
      </MemoryRouter>,
    );

    const navLabels = screen
      .getAllByRole("link")
      .map((link) => link.textContent?.replace(/\s+/g, "") ?? "")
      .filter((label) =>
        ["首页", "导师管理", "任务中心", "统计面板", "个人中心"].includes(label),
      );

    expect(navLabels).toEqual([
      "首页",
      "导师管理",
      "任务中心",
      "统计面板",
      "个人中心",
    ]);
  });
});
