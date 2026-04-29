import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenUsageCenterCard } from "@/components/molecules/TokenUsageCenterCard";

const mockedListTokenUsageRecords = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/tokenUsage", () => ({
  listTokenUsageRecords: mockedListTokenUsageRecords,
}));

describe("TokenUsageCenterCard", () => {
  beforeEach(() => {
    mockedListTokenUsageRecords.mockReset();
  });

  it("loads recent token records after expanding", async () => {
    mockedListTokenUsageRecords.mockResolvedValue({
      records: [
        {
          id: "match_analysis:1",
          feature_type: "match_analysis",
          feature_label: "匹配分析",
          title: "李老师 - 匹配分析",
          input_tokens: 200,
          output_tokens: 30,
          cached_tokens: 80,
          total_tokens: 230,
          model_name: "gpt-test",
          identity_name: "博士申请邮箱",
          created_at: "2026-04-29T10:00:00Z",
          status: "success",
        },
      ],
      summary: {
        input_tokens: 200,
        output_tokens: 30,
        cached_tokens: 80,
        total_tokens: 230,
        record_count: 1,
      },
    });

    render(<TokenUsageCenterCard />);

    const toggle = screen.getByRole("button", { name: /Token 消耗记录中心/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("李老师 - 匹配分析")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mockedListTokenUsageRecords).toHaveBeenCalledWith(20),
    );
    expect(screen.getByText("李老师 - 匹配分析")).toBeInTheDocument();
    expect(screen.getByText("输入 200")).toBeInTheDocument();
    expect(screen.getByText("缓存 80")).toBeInTheDocument();
  });
});
