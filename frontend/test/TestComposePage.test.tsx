import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestComposePage } from "@/pages/TestComposePage";

const mockedUseSelectionContext = vi.hoisted(() => vi.fn());
const mockedGetTestComposeThread = vi.hoisted(() => vi.fn());

vi.mock("@/context/SelectionContext", () => ({
  useSelectionContext: mockedUseSelectionContext,
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({
    notifyError: vi.fn(),
    notifyFormErrors: vi.fn(),
    notifySuccess: vi.fn(),
  }),
}));

vi.mock("@/lib/api/testComposeApi", () => ({
  getTestComposeThread: mockedGetTestComposeThread,
  generateTestComposeDraft: vi.fn(),
  saveTestComposeDraft: vi.fn(),
  sendTestComposeMessage: vi.fn(),
}));

describe("TestComposePage", () => {
  beforeEach(() => {
    mockedUseSelectionContext.mockReturnValue({
      selectedIdentityId: 1,
      selectedLlmProfileId: 1,
    });
    mockedGetTestComposeThread.mockResolvedValue({
      identity: {
        id: 1,
        name: "测试身份",
        email_address: "sender@example.com",
      },
      llm_profile: {
        id: 1,
        name: "测试模型",
        provider: "openai",
        model_name: "gpt-test",
      },
      material_options: [],
      draft: {
        subject: "测试主题",
        body_text: "测试正文",
        body_html: "<p>测试正文</p>",
        selected_material_ids: [],
      },
      history: [
        {
          id: 1,
          recipient_email: "sender@example.com",
          subject: "测试主题",
          content: "测试正文",
          content_html: "<p>测试正文</p>",
          status: "sent",
          rfc_message_id: "<self-test@example.com>",
          failure_summary: null,
          created_at: "2026-04-23T08:00:00Z",
        },
      ],
    });
  });

  it("loads the draft and send history for the current identity and llm", async () => {
    render(
      <MemoryRouter>
        <TestComposePage />
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("测试主题")).toBeInTheDocument();
    expect(screen.getByDisplayValue("测试正文")).toBeInTheDocument();
    expect(screen.getByText("sender@example.com")).toBeInTheDocument();
    expect(screen.getByText("模型：测试模型")).toBeInTheDocument();
  });
});
