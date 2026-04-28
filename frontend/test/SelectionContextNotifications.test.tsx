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

const SelectionSwitchHarness = () => {
  const { selectedLlmProfile, setSelectedLlmProfileId } = useSelectionContext();

  return (
    <div>
      <span data-testid="selected-llm">
        {selectedLlmProfile?.name ?? "no llm"}
      </span>
      <button type="button" onClick={() => setSelectedLlmProfileId(2)}>
        切换到备用模型
      </button>
    </div>
  );
};

describe("SelectionContext notifications", () => {
  beforeEach(() => {
    listIdentities.mockReset();
    listLLMProfiles.mockReset();
    window.localStorage.clear();
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
        profile_name: "测试身份",
        sender_name: "测试身份",
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

  it("keeps a manually selected llm profile instead of bouncing back to the stored id", async () => {
    window.localStorage.setItem("selected_llm_profile_id", "1");
    listIdentities.mockResolvedValue([]);
    listLLMProfiles.mockResolvedValue([
      {
        id: 1,
        name: "主模型",
        provider: "openai",
        api_base_url: null,
        api_key: "test-key-1",
        model_name: "gpt-main",
        matcher_prompt_template: null,
        writer_prompt_template: null,
        temperature: null,
        max_tokens: null,
        is_default: true,
        created_at: "2026-04-22T00:00:00Z",
        updated_at: "2026-04-22T00:00:00Z",
      },
      {
        id: 2,
        name: "备用模型",
        provider: "openai",
        api_base_url: null,
        api_key: "test-key-2",
        model_name: "gpt-backup",
        matcher_prompt_template: null,
        writer_prompt_template: null,
        temperature: null,
        max_tokens: null,
        is_default: false,
        created_at: "2026-04-22T00:00:00Z",
        updated_at: "2026-04-22T00:00:00Z",
      },
    ]);

    render(
      <NotificationProvider>
        <SelectionProvider>
          <SelectionSwitchHarness />
        </SelectionProvider>
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-llm")).toHaveTextContent("主模型");
    });

    fireEvent.click(screen.getByRole("button", { name: "切换到备用模型" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-llm")).toHaveTextContent("备用模型");
      expect(window.localStorage.getItem("selected_llm_profile_id")).toBe("2");
    });
  });
});
