import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/context/NotificationContext";
import {
  SelectionProvider,
  useSelectionContext,
} from "@/context/SelectionContext";

const listIdentities = vi.hoisted(() => vi.fn());
const listLLMProfiles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/identities", () => ({
  listIdentities,
}));

vi.mock("@/lib/api/llmProfiles", () => ({
  listLLMProfiles,
}));

const SelectionHarness = () => {
  const { selectedIdentity, selectedLlmProfile } = useSelectionContext();

  return (
    <div>
      <span>{selectedIdentity?.name ?? "no identity"}</span>
      <span>{selectedLlmProfile?.name ?? "no llm"}</span>
    </div>
  );
};

describe("SelectionContext notifications", () => {
  beforeEach(() => {
    listIdentities.mockReset();
    listLLMProfiles.mockReset();
  });

  it("shows a global notification card when the initial refresh fails", async () => {
    listIdentities.mockRejectedValue(new Error("加载全局上下文失败"));
    listLLMProfiles.mockResolvedValue([]);

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

  it("selects the first available identity and llm profile after bootstrap", async () => {
    listIdentities.mockResolvedValue([
      {
        id: 1,
        name: "测试身份",
        email_address: "sender@example.com",
        smtp_host: "smtp.example.com",
        smtp_port: 465,
        smtp_username: "sender@example.com",
        smtp_password: "secret",
        imap_host: null,
        imap_port: null,
        imap_username: null,
        imap_password: null,
        default_language: "zh-CN",
        outreach_generation_mode: "llm",
        outreach_template_subject: "测试主题",
        outreach_template_body_text: "测试正文",
        outreach_template_body_html: "<p>测试正文</p>",
        current_primary_material_id: null,
        current_primary_material: null,
        match_threshold: null,
        daily_send_limit: null,
        send_interval_min: null,
        send_interval_max: null,
        same_domain_cooldown_minutes: null,
        is_default: true,
        materials: [],
        created_at: "2026-04-22T00:00:00Z",
        updated_at: "2026-04-22T00:00:00Z",
      },
    ]);
    listLLMProfiles.mockResolvedValue([
      {
        id: 1,
        name: "测试模型",
        provider: "openai",
        api_base_url: null,
        api_key: "test-key",
        model_name: "gpt-test",
        matcher_prompt_template: null,
        writer_prompt_template: null,
        temperature: null,
        max_tokens: null,
        is_default: true,
        created_at: "2026-04-22T00:00:00Z",
        updated_at: "2026-04-22T00:00:00Z",
      },
    ]);

    render(
      <NotificationProvider>
        <SelectionProvider>
          <SelectionHarness />
        </SelectionProvider>
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("测试身份")).toBeInTheDocument();
      expect(screen.getByText("测试模型")).toBeInTheDocument();
    });
  });
});
