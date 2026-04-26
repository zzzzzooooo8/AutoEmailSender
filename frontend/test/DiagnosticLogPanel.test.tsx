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

  it("显示本地日志数量和后端日志条目", async () => {
    seedLocalDiagnostics();

    render(<DiagnosticLogPanel />);

    expect(screen.getByText("本地日志 2 条")).toBeInTheDocument();
    expect(screen.getByText("api.request_failed")).toBeInTheDocument();
    expect(await screen.findByText("crawl_job.create_failed")).toBeInTheDocument();
    expect(screen.getByText("req-101")).toBeInTheDocument();
    expect(listOperationLogs).toHaveBeenCalledWith({ limit: 20 });
  });

  it("后端加载失败时仍显示本地日志和错误提示", async () => {
    seedLocalDiagnostics();
    vi.mocked(listOperationLogs).mockRejectedValue(new Error("backend down"));

    render(<DiagnosticLogPanel />);

    expect(screen.getByText("本地日志 2 条")).toBeInTheDocument();
    expect(screen.getByText("api.request_failed")).toBeInTheDocument();
    expect(await screen.findByText("后端诊断日志暂时不可用")).toBeInTheDocument();
  });

  it("修改后端日志筛选条件时会带上对应参数重新加载", async () => {
    render(<DiagnosticLogPanel />);

    await screen.findByText("crawl_job.create_failed");
    expect(
      screen.getByRole("option", { name: "warning（后端）" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "crawler（后端）" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Level"), {
      target: { value: "warning" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "crawler" },
    });

    await waitFor(() =>
      expect(listOperationLogs).toHaveBeenCalledWith({
        limit: 20,
        level: "warning",
        category: "crawler",
      }),
    );
  });

  it("点击导出会生成合并 JSON 并触发下载", async () => {
    seedLocalDiagnostics();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<DiagnosticLogPanel />);

    await screen.findByText("crawl_job.create_failed");
    fireEvent.click(screen.getByRole("button", { name: "导出诊断日志" }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const payload = JSON.parse(await blob.text());

    expect(payload).toMatchObject({
      exportedAt: expect.any(String),
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
  });

  it("清空本地日志会调用清理逻辑并更新数量", async () => {
    seedLocalDiagnostics();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DiagnosticLogPanel />);

    expect(screen.getByText("本地日志 2 条")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清空本地日志" }));

    expect(getDiagnosticEvents()).toEqual([]);
    expect(screen.getByText("本地日志 0 条")).toBeInTheDocument();
    expect(notificationApi.notifySuccess).toHaveBeenCalledWith("本地诊断日志已清空");
  });
});
