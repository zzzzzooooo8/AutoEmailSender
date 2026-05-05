import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OtherSettingsCard } from "@/components/molecules/OtherSettingsCard";

vi.mock("@/lib/api/runtimeSettings", () => ({
  getRuntimeSettings: vi.fn(async () => ({
    match_analysis_job_worker_count: 1,
    match_analysis_job_item_concurrency: 3,
    match_analysis_job_interval_seconds: 10,
    crawler_worker_count: 2,
    crawler_profile_enrichment_concurrency: 3,
    crawler_host_concurrency: 1,
    updated_at: "2026-05-04T00:00:00Z",
  })),
  updateRuntimeSettings: vi.fn(async (payload) => ({
    ...payload,
    updated_at: "2026-05-04T00:00:01Z",
  })),
}));

describe("OtherSettingsCard", () => {
  it("loads and saves runtime concurrency settings", async () => {
    const api = await import("@/lib/api/runtimeSettings");

    render(<OtherSettingsCard />);

    fireEvent.click(screen.getByRole("button", { name: /其他设置/ }));
    expect(await screen.findByLabelText("批量匹配分析并发数")).toHaveValue(3);

    fireEvent.change(screen.getByLabelText("批量匹配分析并发数"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(api.updateRuntimeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          match_analysis_job_item_concurrency: 4,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "保存设置" })).toBeEnabled();
    });
    expect(screen.getByLabelText("批量匹配分析并发数")).toHaveValue(4);
  });
});
