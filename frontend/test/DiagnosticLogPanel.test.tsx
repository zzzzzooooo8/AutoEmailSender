import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosticLogPanel } from "@/components/organisms/DiagnosticLogPanel";
import {
  clearDiagnosticEvents,
  getDiagnosticEvents,
  recordDiagnosticEvent,
} from "@/lib/diagnostics";
import {
  exportOperationLogs,
  listOperationLogs,
} from "@/lib/api/diagnosticsApi";

const notificationApi = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => notificationApi,
}));

vi.mock("@/lib/api/diagnosticsApi", () => ({
  exportOperationLogs: vi.fn(),
  listOperationLogs: vi.fn(),
}));

const backendLogs = [
  {
    id: 101,
    event_name: "crawl_job.create_failed",
    level: "error",
    category: "api",
    request_id: "req-101",
    message: "创建抓取任务失败，后端返回 500",
    created_at: "2026-04-25T10:00:00Z",
  },
  {
    id: 100,
    event_name: "profile.save",
    level: "info",
    category: "user_action",
    request_id: null,
    message: "保存配置成功",
    created_at: "2026-04-25T09:50:00Z",
  },
];

function seedLocalDiagnostics() {
  recordDiagnosticEvent({
    level: "error",
    category: "api",
    eventName: "api.request_failed",
    message: "创建抓取任务失败",
  });
  recordDiagnosticEvent({
    level: "info",
    category: "user_action",
    eventName: "profile.opened",
    message: "打开个人中心",
  });
}

function todayInputValue() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
}

function expectDateRangeParams(extra: Record<string, unknown> = {}) {
  return expect.objectContaining({
    start_at: expect.any(String),
    end_at: expect.any(String),
    ...extra,
  });
}

async function expandPanel() {
  fireEvent.click(screen.getByRole("button", { name: /开发诊断日志/ }));
  await waitFor(() => {
    expect(listOperationLogs).toHaveBeenCalled();
  });
}

describe("DiagnosticLogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDiagnosticEvents();
    vi.mocked(listOperationLogs).mockResolvedValue({
      items: backendLogs,
      total: 2,
      limit: 20,
      offset: 0,
    });
    vi.mocked(exportOperationLogs).mockResolvedValue({
      exported_at: "2026-04-25T10:01:00Z",
      items: backendLogs,
      total: 2,
      filters: {},
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:diagnostics"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("默认折叠，不展示日志预览，也不主动加载后端日志", () => {
    seedLocalDiagnostics();

    render(<DiagnosticLogPanel />);

    expect(screen.getByRole("button", { name: /开发诊断日志/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByText("本地 2")).toBeInTheDocument();
    expect(screen.queryByText("本地事件")).not.toBeInTheDocument();
    expect(screen.queryByText("api.request_failed")).not.toBeInTheDocument();
    expect(screen.queryByText("crawl_job.create_failed")).not.toBeInTheDocument();
    expect(listOperationLogs).not.toHaveBeenCalled();
  });

  it("点击后展开控制区并按默认今天加载后端日志", async () => {
    seedLocalDiagnostics();

    render(<DiagnosticLogPanel />);
    await expandPanel();

    expect(screen.getByRole("button", { name: /开发诊断日志/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("导出日期")).toHaveValue(todayInputValue());
    expect(screen.getByText("本地事件")).toBeInTheDocument();
    expect(screen.getByText("后端日志")).toBeInTheDocument();
    expect(screen.queryByText("api.request_failed")).not.toBeInTheDocument();
    expect(screen.queryByText("crawl_job.create_failed")).not.toBeInTheDocument();
    expect(listOperationLogs).toHaveBeenCalledWith(
      expectDateRangeParams({ limit: 20 }),
    );
  });

  it("展开和收起诊断内容时使用过渡容器", async () => {
    render(<DiagnosticLogPanel />);
    await expandPanel();

    const content = document.getElementById("diagnostic-log-panel-content");
    expect(content).toHaveClass("collapsible-card-content");
    expect(content).toHaveAttribute("data-state", "open");

    fireEvent.click(screen.getByRole("button", { name: /开发诊断日志/ }));

    expect(content).toHaveAttribute("data-state", "closed");
    fireEvent.transitionEnd(content!, { propertyName: "grid-template-rows" });

    expect(document.getElementById("diagnostic-log-panel-content")).not.toBeInTheDocument();
  });

  it("后端加载失败时只显示不可用提示", async () => {
    vi.mocked(listOperationLogs).mockRejectedValue(new Error("backend down"));

    render(<DiagnosticLogPanel />);
    fireEvent.click(screen.getByRole("button", { name: /开发诊断日志/ }));

    expect(await screen.findByText("后端诊断日志暂时不可用")).toBeInTheDocument();
  });

  it("修改日期和筛选条件时会带上对应参数重新加载", async () => {
    render(<DiagnosticLogPanel />);
    await expandPanel();

    fireEvent.change(screen.getByLabelText("导出日期"), {
      target: { value: "2026-04-25" },
    });
    fireEvent.change(screen.getByLabelText("Level"), {
      target: { value: "warning" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "crawler" },
    });

    await waitFor(() =>
      expect(listOperationLogs).toHaveBeenCalledWith(
        expectDateRangeParams({
          limit: 20,
          level: "warning",
          category: "crawler",
        }),
      ),
    );
  });

  it("点击导出会按选中日期生成合并 JSON 并触发下载", async () => {
    seedLocalDiagnostics();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<DiagnosticLogPanel />);
    await expandPanel();

    fireEvent.click(screen.getByRole("button", { name: "导出诊断日志" }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const payload = JSON.parse(await blob.text());

    expect(exportOperationLogs).toHaveBeenCalledWith(expectDateRangeParams());
    expect(payload).toMatchObject({
      exportedAt: expect.any(String),
      selectedDate: todayInputValue(),
      frontend: {
        events: expect.arrayContaining([
          expect.objectContaining({ eventName: "api.request_failed" }),
          expect.objectContaining({ eventName: "profile.opened" }),
        ]),
      },
      backend: {
        items: expect.arrayContaining([
          expect.objectContaining({ event_name: "crawl_job.create_failed" }),
        ]),
      },
    });
    expect(notificationApi.notifySuccess).toHaveBeenCalledWith("诊断日志已导出");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:diagnostics");
    expect(getDiagnosticEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "user_action",
          eventName: "diagnostics.export_succeeded",
        }),
      ]),
    );
  });

  it("导出失败时会记录本地诊断事件", async () => {
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      throw new Error("blob failed");
    });

    render(<DiagnosticLogPanel />);
    await expandPanel();

    fireEvent.click(screen.getByRole("button", { name: "导出诊断日志" }));

    await waitFor(() => {
      expect(notificationApi.notifyError).toHaveBeenCalledWith(
        "导出诊断日志失败",
        "blob failed",
      );
    });
    expect(getDiagnosticEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "user_action",
          eventName: "diagnostics.export_failed",
          message: "blob failed",
        }),
      ]),
    );
  });

  it("清空本地日志会调用清理逻辑并更新数量", async () => {
    seedLocalDiagnostics();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DiagnosticLogPanel />);
    await expandPanel();

    expect(screen.getByText("本地 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清空本地日志" }));

    expect(getDiagnosticEvents()).toEqual([
      expect.objectContaining({
        category: "user_action",
        eventName: "diagnostics.local_logs_cleared",
      }),
    ]);
    expect(screen.getByText("本地 1")).toBeInTheDocument();
    expect(notificationApi.notifySuccess).toHaveBeenCalledWith("本地诊断日志已清空");
  });
});
