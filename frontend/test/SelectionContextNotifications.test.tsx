import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/context/NotificationContext";
import { SelectionProvider } from "@/context/SelectionContext";

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
          <div>selection harness</div>
        </SelectionProvider>
      </NotificationProvider>,
    );

    await waitFor(() => {
      const message = screen.getByText("加载全局上下文失败");
      expect(message.closest('[data-testid="notification-card"]')).not.toBeNull();
    });
  });
});
