import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/context/NotificationContext";
import {
  SelectionProvider,
  useSelectionContext,
} from "@/context/SelectionContext";

const listIdentities = vi.hoisted(() => vi.fn());
const listLLMProfiles = vi.hoisted(() => vi.fn());
const getSystemSettings = vi.hoisted(() => vi.fn());
const updateSystemSettings = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/identities", () => ({
  listIdentities,
}));

vi.mock("@/lib/api/llmProfiles", () => ({
  listLLMProfiles,
}));

vi.mock("@/lib/api/systemSettings", () => ({
  getSystemSettings,
  updateSystemSettings,
}));

const SelectionHarness = () => {
  const { setMailDeliveryMode } = useSelectionContext();

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void setMailDeliveryMode("live").catch(() => undefined);
        }}
      >
        switch mode
      </button>
    </div>
  );
};

describe("SelectionContext notifications", () => {
  beforeEach(() => {
    listIdentities.mockReset();
    listLLMProfiles.mockReset();
    getSystemSettings.mockReset();
    updateSystemSettings.mockReset();
  });

  it("shows a global notification card when the initial refresh fails", async () => {
    listIdentities.mockRejectedValue(new Error("加载全局上下文失败"));
    listLLMProfiles.mockResolvedValue([]);
    getSystemSettings.mockResolvedValue({ mail_delivery_mode: "dry_run" });

    render(
      <NotificationProvider>
        <SelectionProvider>
          <SelectionHarness />
        </SelectionProvider>
      </NotificationProvider>,
    );

    await waitFor(() => {
      const cards = screen.getAllByTestId("notification-card");
      expect(
        cards.some((card) => card.textContent?.includes("加载全局上下文失败")),
      ).toBe(true);
    });
  });

  it("shows a global notification card when switching mail mode fails", async () => {
    listIdentities.mockResolvedValue([]);
    listLLMProfiles.mockResolvedValue([]);
    getSystemSettings.mockResolvedValue({ mail_delivery_mode: "dry_run" });
    updateSystemSettings.mockRejectedValue(new Error("写入发送模式失败"));

    render(
      <NotificationProvider>
        <SelectionProvider>
          <SelectionHarness />
        </SelectionProvider>
      </NotificationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "switch mode" }));

    await waitFor(() => {
      const cards = screen.getAllByTestId("notification-card");
      expect(
        cards.some(
          (card) =>
            card.textContent?.includes("切换发送模式失败") &&
            card.textContent?.includes("写入发送模式失败"),
        ),
      ).toBe(true);
    });
  });
});
