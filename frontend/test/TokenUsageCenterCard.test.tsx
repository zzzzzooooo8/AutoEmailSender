import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenUsageCenterCard } from "@/components/molecules/TokenUsageCenterCard";
import { formatTokenUsageBucketLabel } from "@/features/token-usage/client/tokenUsage";
import type { TokenUsageRecordListDTO } from "@/types";

const mockedListTokenUsageRecords = vi.hoisted(() => vi.fn());
const mockedGetTokenUsageChart = vi.hoisted(() => vi.fn());
const chartBucketStart = "2026-04-30T10:00:00Z";
const chartBucketLabel = "10:00";

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
          bucket_start: chartBucketStart,
          bucket_label: chartBucketLabel,
          input_tokens: 200,
          output_tokens: 30,
          total_tokens: 230,
        },
      ],
    });
  });

  it("loads the header record count before expanding", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(
      createRecordListResult({
        summary: {
          input_tokens: 500,
          output_tokens: 80,
          cached_tokens: 80,
          total_tokens: 580,
          record_count: 12,
        },
        pagination: {
          page: 1,
          page_size: 5,
          total_records: 12,
          total_pages: 3,
        },
      }),
    );

    render(<TokenUsageCenterCard />);

    const toggle = screen.getByRole("button", { name: /Token 消耗记录中心/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await waitFor(() => expect(screen.getByText("共 12 条")).toBeInTheDocument());
    expect(mockedGetTokenUsageChart).not.toHaveBeenCalled();
    expect(screen.queryByText("李老师 - 匹配分析")).not.toBeInTheDocument();
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
        modelName: null,
        startAt: null,
        endAt: null,
      }),
    );
    expect(mockedGetTokenUsageChart).toHaveBeenCalledWith({
      featureType: "all",
      modelName: null,
      preset: "last_24_hours",
      startAt: null,
      endAt: null,
    });
    expect(screen.getByText("李老师 - 匹配分析")).toBeInTheDocument();
    expect(screen.getByText("输入 200")).toBeInTheDocument();
    expect(screen.getByText("缓存 80")).toBeInTheDocument();
  });

  it("animates content while opening and closing", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(createRecordListResult());
    render(<TokenUsageCenterCard />);

    const toggle = screen.getByRole("button", { name: /Token 消耗记录中心/ });
    await waitFor(() => expect(screen.getByText("共 1 条")).toBeInTheDocument());

    fireEvent.click(toggle);

    const content = await screen.findByText("李老师 - 匹配分析").then(() =>
      document.getElementById("token-usage-center-content"),
    );

    expect(content).toHaveClass("collapsible-card-content");
    expect(content).toHaveAttribute("data-state", "open");

    fireEvent.click(toggle);

    expect(content).toHaveAttribute("data-state", "closed");

    fireEvent.transitionEnd(content!, { propertyName: "grid-template-rows" });

    expect(document.getElementById("token-usage-center-content")).not.toBeInTheDocument();
  });

  it("filters records and chart by feature type", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(createRecordListResult());
    const { container } = render(<TokenUsageCenterCard />);

    fireEvent.click(screen.getByRole("button", { name: /Token 消耗记录中心/ }));
    await waitFor(() => expect(mockedListTokenUsageRecords).toHaveBeenCalled());

    expect(container.querySelector("select")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "功能筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "匹配分析" }));
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    await waitFor(() =>
      expect(mockedListTokenUsageRecords).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 5,
        featureType: "match_analysis",
        modelName: null,
        startAt: null,
        endAt: null,
      }),
    );
    expect(mockedGetTokenUsageChart).toHaveBeenLastCalledWith({
      featureType: "match_analysis",
      modelName: null,
      preset: "last_24_hours",
      startAt: null,
      endAt: null,
    });
  });

  it("keeps wide controls constrained inside the profile page column", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(createRecordListResult());
    render(<TokenUsageCenterCard />);

    fireEvent.click(screen.getByRole("button", { name: /Token 消耗记录中心/ }));
    await waitFor(() => expect(screen.getByText("输入 / 输出趋势")).toBeInTheDocument());

    const featureFilter = screen.getByRole("button", { name: "功能筛选" });
    const filterPanel = featureFilter.closest(".grid");
    expect(filterPanel).toHaveClass("min-w-0");
    expect(filterPanel).toHaveClass("md:grid-cols-2");
    expect(filterPanel).toHaveClass(
      "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]",
    );

    const label = expectedChartBucketLabel();
    const chartScroller = screen.getByLabelText(`${label} 输入 200 输出 30 总计 230`)
      .closest(".overflow-x-auto");
    expect(chartScroller).toHaveClass("max-w-full");
    expect(chartScroller).toHaveClass("min-w-0");
  });

  it("filters records and chart by model name", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(
      createRecordListResult({
        model_options: ["gpt-test", "gpt-alt"],
      }),
    );
    render(<TokenUsageCenterCard />);

    fireEvent.click(screen.getByRole("button", { name: /Token 消耗记录中心/ }));
    await waitFor(() => expect(mockedListTokenUsageRecords).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "模型筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "gpt-alt" }));
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    await waitFor(() =>
      expect(mockedListTokenUsageRecords).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 5,
        featureType: "all",
        modelName: "gpt-alt",
        startAt: null,
        endAt: null,
      }),
    );
    expect(mockedGetTokenUsageChart).toHaveBeenLastCalledWith({
      featureType: "all",
      modelName: "gpt-alt",
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
        modelName: null,
        startAt: null,
        endAt: null,
      }),
    );
  });

  it("keeps the current records visible while loading another page", async () => {
    const nextPageResult = createRecordListResult({
      records: [
        {
          id: "match_analysis:2",
          feature_type: "match_analysis",
          feature_label: "匹配分析",
          title: "王老师 - 匹配分析",
          input_tokens: 300,
          output_tokens: 50,
          cached_tokens: 0,
          total_tokens: 350,
          model_name: "gpt-test",
          identity_name: "博士申请邮箱",
          created_at: "2026-04-29T11:00:00Z",
          status: "success",
        },
      ],
      summary: {
        input_tokens: 500,
        output_tokens: 80,
        cached_tokens: 80,
        total_tokens: 580,
        record_count: 2,
      },
      pagination: {
        page: 2,
        page_size: 5,
        total_records: 10,
        total_pages: 2,
      },
    });
    const deferredNextPage = createDeferred<TokenUsageRecordListDTO>();
    mockedListTokenUsageRecords
      .mockResolvedValueOnce(
        createRecordListResult({
          pagination: {
            page: 1,
            page_size: 5,
            total_records: 10,
            total_pages: 2,
          },
        }),
      )
      .mockReturnValueOnce(deferredNextPage.promise);

    render(<TokenUsageCenterCard />);

    fireEvent.click(screen.getByRole("button", { name: /Token 消耗记录中心/ }));
    await waitFor(() => expect(screen.getByText("李老师 - 匹配分析")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() =>
      expect(screen.getByText("正在更新 token 消耗记录...")).toBeInTheDocument(),
    );
    expect(screen.getByText("李老师 - 匹配分析")).toBeInTheDocument();
    expect(screen.queryByText("正在加载 token 消耗记录...")).not.toBeInTheDocument();

    deferredNextPage.resolve(nextPageResult);

    await waitFor(() => expect(screen.getByText("王老师 - 匹配分析")).toBeInTheDocument());
    expect(screen.queryByText("正在更新 token 消耗记录...")).not.toBeInTheDocument();
  });

  it("renders stacked chart buckets", async () => {
    mockedListTokenUsageRecords.mockResolvedValue(createRecordListResult());
    render(<TokenUsageCenterCard />);

    fireEvent.click(screen.getByRole("button", { name: /Token 消耗记录中心/ }));

    await waitFor(() => expect(screen.getByText("输入 / 输出趋势")).toBeInTheDocument());
    const label = expectedChartBucketLabel();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("250 tokens")).toBeInTheDocument();
    expect(screen.getByText("0 tokens")).toBeInTheDocument();

    const bar = screen.getByLabelText(`${label} 输入 200 输出 30 总计 230`);
    fireEvent.mouseEnter(bar, { clientX: 180, clientY: 90 });
    fireEvent.mouseMove(bar, { clientX: 210, clientY: 120 });
    expect(screen.getByRole("tooltip")).toHaveStyle({
      left: "224px",
      top: "134px",
    });

    expect(screen.getByText("合计 230 tokens")).toBeInTheDocument();
    expect(screen.getAllByText("输入tokens").length).toBeGreaterThan(0);
    expect(screen.getAllByText("200 tokens").length).toBeGreaterThan(0);
    expect(screen.getAllByText("输出tokens").length).toBeGreaterThan(0);
    expect(screen.getByText("30 tokens")).toBeInTheDocument();

    fireEvent.mouseLeave(bar);
    expect(screen.queryByText("合计 230 tokens")).not.toBeInTheDocument();
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
    model_options: ["gpt-test"],
    ...overrides,
  };
}

function expectedChartBucketLabel(): string {
  return formatTokenUsageBucketLabel({
    bucketStart: chartBucketStart,
    fallbackLabel: chartBucketLabel,
    granularity: "hour",
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
