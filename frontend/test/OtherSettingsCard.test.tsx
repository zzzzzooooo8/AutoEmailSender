import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OtherSettingsCard } from "@/components/molecules/OtherSettingsCard";

vi.mock("@/lib/api/runtimeSettings", () => ({
  defaultDraftRewritePreferences: {
    draft_rewrite_intensity: "moderate",
    draft_rewrite_tone: "polite",
    draft_rewrite_formality: "balanced",
    draft_rewrite_length: "default",
    draft_rewrite_specificity: "balanced",
    draft_template_preservation: "structure_first",
  },
  getRuntimeSettings: vi.fn(async () => ({
    match_analysis_job_worker_count: 1,
    match_analysis_job_item_concurrency: 3,
    match_analysis_job_interval_seconds: 10,
    crawler_worker_count: 2,
    crawler_profile_enrichment_concurrency: 3,
    crawler_host_concurrency: 1,
    draft_max_tokens: 3600,
    draft_rewrite_intensity: "moderate",
    draft_rewrite_tone: "polite",
    draft_rewrite_formality: "balanced",
    draft_rewrite_length: "default",
    draft_rewrite_specificity: "balanced",
    draft_template_preservation: "structure_first",
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
    expect(screen.getByLabelText("AI 草稿输出 token 上限")).toHaveValue(3600);

    fireEvent.change(screen.getByLabelText("批量匹配分析并发数"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("AI 草稿输出 token 上限"), {
      target: { value: "4800" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(api.updateRuntimeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          match_analysis_job_item_concurrency: 4,
          draft_max_tokens: 4800,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "保存设置" })).toBeEnabled();
    });
    expect(screen.getByLabelText("批量匹配分析并发数")).toHaveValue(4);
  });

  it("loads saves and resets draft rewrite preferences", async () => {
    const api = await import("@/lib/api/runtimeSettings");

    render(<OtherSettingsCard />);

    fireEvent.click(screen.getByRole("button", { name: /其他设置/ }));
    expect(await screen.findByLabelText("改写强度")).toHaveValue("moderate");
    expect(screen.getByText("示例效果")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("改写强度"), {
      target: { value: "strong" },
    });
    fireEvent.change(screen.getByLabelText("语气"), {
      target: { value: "professional" },
    });
    expect(screen.getByText(/更主动/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "恢复草稿默认" }));
    expect(screen.getByLabelText("改写强度")).toHaveValue("moderate");

    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => {
      expect(api.updateRuntimeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          draft_rewrite_intensity: "moderate",
          draft_rewrite_tone: "polite",
          draft_rewrite_formality: "balanced",
          draft_rewrite_length: "default",
          draft_rewrite_specificity: "balanced",
          draft_template_preservation: "structure_first",
        }),
      );
    });
  });
});
