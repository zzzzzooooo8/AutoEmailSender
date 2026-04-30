import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenUsageCenterCard } from "@/components/molecules/TokenUsageCenterCard";
import type { TokenUsageRecordListDTO } from "@/types";

const mockedListTokenUsageRecords = vi.hoisted(() => vi.fn());
const mockedGetTokenUsageChart = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/tokenUsage", () => ({
  listTokenUsageRecords: mockedListTokenUsageRecords,
  getTokenUsageChart: mockedGetTokenUsageChart,
}));

describe("TokenUsageCenterCard", () => {
  beforeEach(() => {
    mockedListTokenUsageRecords.mockReset();
    mockedGetTokenUsageChart.mockReset();
    mockedGetTokenUsageChart.mockResolvedValue({
      preset: "last_24_hours",
      granularity: "hour",
      range_start: "2026-04-29T10:00:00Z",
      range_end: "2026-04-30T10:00:00Z",
      buckets: [
        {
          bucket_start: "2026-04-30T10:00:00Z",
          bucket_label: "10:00",
          input_tokens: 200,
          output_tokens: 30,
          total_tokens: 230,
        },
      ],
    });
  });

  it("loads recent token records after expanding", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(createRecordListResult());

    render(<TokenUsageCenterCard />);

    const toggle = screen.getByRole("button", { name: /Token 消耗记录中心/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("李老师 - 匹配分析")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mockedListTokenUsageRecords).toHaveBeenCalledWith({
        page: 1,
        pageSize: 5,
        featureType: "all",
        startAt: null,
        endAt: null,
      }),
    );
    expect(mockedGetTokenUsageChart).toHaveBeenCalledWith({
      featureType: "all",
      preset: "last_24_hours",
      startAt: null,
      endAt: null,
    });
    expect(screen.getByText("李老师 - 匹配分析")).toBeInTheDocument();
    expect(screen.getByText("输入 200")).toBeInTheDocument();
    expect(screen.getByText("缓存 80")).toBeInTheDocument();
  });

  it("filters records and chart by feature type", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(createRecordListResult());
    render(<TokenUsageCenterCard />);

    fireEvent.click(screen.getByRole("button", { name: /Token 消耗记录中心/ }));
    await waitFor(() => expect(mockedListTokenUsageRecords).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("功能筛选"), {
      target: { value: "match_analysis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    await waitFor(() =>
      expect(mockedListTokenUsageRecords).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 5,
        featureType: "match_analysis",
        startAt: null,
        endAt: null,
      }),
    );
    expect(mockedGetTokenUsageChart).toHaveBeenLastCalledWith({
      featureType: "match_analysis",
      preset: "last_24_hours",
      startAt: null,
      endAt: null,
    });
  });

  it("jumps to an entered page", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(
      createRecordListResult({
        pagination: {
          page: 1,
          page_size: 5,
          total_records: 12,
          total_pages: 3,
        },
      }),
    );
    render(<TokenUsageCenterCard />);

    fireEvent.click(screen.getByRole("button", { name: /Token 消耗记录中心/ }));
    await waitFor(() => expect(screen.getByText("第 1 / 3 页")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("跳转页号"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "跳转" }));

    await waitFor(() =>
      expect(mockedListTokenUsageRecords).toHaveBeenLastCalledWith({
        page: 3,
        pageSize: 5,
        featureType: "all",
        startAt: null,
        endAt: null,
      }),
    );
  });

  it("renders stacked chart buckets", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(createRecordListResult());
    render(<TokenUsageCenterCard />);

    fireEvent.click(screen.getByRole("button", { name: /Token 消耗记录中心/ }));

    await waitFor(() => expect(screen.getByText("输入 / 输出趋势")).toBeInTheDocument());
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByLabelText("10:00 输入 200 输出 30")).toBeInTheDocument();
  });
});

function createRecordListResult(
  overrides: Partial<TokenUsageRecordListDTO> = {},
): TokenUsageRecordListDTO {
  return {
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
    pagination: {
      page: 1,
      page_size: 5,
      total_records: 1,
      total_pages: 1,
    },
    ...overrides,
  };
}
