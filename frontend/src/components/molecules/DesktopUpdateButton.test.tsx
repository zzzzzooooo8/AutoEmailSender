import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopUpdateButton } from "@/components/molecules/DesktopUpdateButton";
import type { DesktopUpdateStatus } from "@/types/desktop";

const notifySuccess = vi.fn();
const notifyError = vi.fn();
const confirm = vi.fn();

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({
    notifySuccess,
    notifyError,
  }),
}));

vi.mock("@/lib/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm,
    dialog: null,
  }),
}));

describe("DesktopUpdateButton", () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, "autoEmailSender");
    window.localStorage.clear();
    notifySuccess.mockClear();
    notifyError.mockClear();
    confirm.mockReset();
    confirm.mockResolvedValue(false);
  });

  it("does not render in browser mode", () => {
    const { container } = render(<DesktopUpdateButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a notification when no update is available", async () => {
    window.autoEmailSender = buildDesktopApi({
      checkForUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
    });

    render(<DesktopUpdateButton />);
    fireEvent.click(await screen.findByRole("button", { name: /检查更新/ }));

    await waitFor(() => {
      expect(notifySuccess).toHaveBeenCalledWith("检查更新", "当前已是最新版本。");
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("shows download choices and keeps NEW when update is available", async () => {
    window.autoEmailSender = buildDesktopApi({
      checkForUpdate: async () => ({
        state: "available",
        version: "0.1.0",
        nextVersion: "0.1.1",
        fullDownloadBytes: 200 * 1024 * 1024,
      }),
    });

    render(<DesktopUpdateButton />);
    fireEvent.click(await screen.findByRole("button", { name: /检查更新/ }));

    expect(await screen.findByRole("button", { name: /增量下载/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /全量下载/ })).toBeInTheDocument();
    expect(screen.getByText(/增量下载：开始后显示实际大小/)).toBeInTheDocument();
    expect(screen.getByText(/全量约 200.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/v0\.1\.1/)).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByText("NEW")).toBeInTheDocument();
    expect(window.localStorage.getItem("desktop_pending_update_version")).toBe("0.1.1");
  });

  it("shows persistent update progress without blocking the page", async () => {
    const listeners: Array<(status: DesktopUpdateStatus) => void> = [];
    window.autoEmailSender = buildDesktopApi({
      onUpdateStatus: (callback) => {
        listeners.push(callback);
        return () => undefined;
      },
    });

    render(<DesktopUpdateButton />);
    listeners[0]?.({
      state: "downloading",
      version: "0.1.0",
      nextVersion: "0.1.1",
      percent: 50,
      transferredBytes: 10 * 1024 * 1024,
      totalBytes: 20 * 1024 * 1024,
      remainingBytes: 10 * 1024 * 1024,
      bytesPerSecond: 512 * 1024,
      remainingSeconds: 20,
      mode: "differential",
    });

    expect(await screen.findByText(/增量包：总计 20.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/增量包：已下载 10.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/增量包：剩余 10.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/512.0 KB\/s/)).toBeInTheDocument();
    expect(screen.getByText(/预计 20 秒/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("allows users to start a full download proactively", async () => {
    const downloadUpdate = vi.fn(async () => ({
      state: "downloaded_pending_install" as const,
      version: "0.1.0",
      nextVersion: "0.1.1",
      fullDownloadBytes: 200,
    }));
    window.autoEmailSender = buildDesktopApi({
      checkForUpdate: async () => ({
        state: "available",
        version: "0.1.0",
        nextVersion: "0.1.1",
        fullDownloadBytes: 200,
      }),
      downloadUpdate,
    });

    render(<DesktopUpdateButton />);
    fireEvent.click(await screen.findByRole("button", { name: /检查更新/ }));
    fireEvent.click(await screen.findByRole("button", { name: /全量下载/ }));

    await waitFor(() => {
      expect(downloadUpdate).toHaveBeenCalledWith({ mode: "full" });
    });
  });

  it("switches slow differential downloads to full download", async () => {
    const listeners: Array<(status: DesktopUpdateStatus) => void> = [];
    const switchToFullDownload = vi.fn(async () => ({
      state: "downloading" as const,
      version: "0.1.0",
      nextVersion: "0.1.1",
      percent: 30,
      transferredBytes: 30,
      totalBytes: 100,
      remainingBytes: 70,
      bytesPerSecond: 10,
      remainingSeconds: 7,
      mode: "full" as const,
    }));
    window.autoEmailSender = buildDesktopApi({
      switchToFullDownload,
      onUpdateStatus: (callback) => {
        listeners.push(callback);
        return () => undefined;
      },
    });

    render(<DesktopUpdateButton />);
    listeners[0]?.({
      state: "slow_download_offered",
      version: "0.1.0",
      nextVersion: "0.1.1",
      fullDownloadBytes: 200,
      percent: 10,
      transferredBytes: 20,
      totalBytes: 100,
      remainingBytes: 80,
      bytesPerSecond: 2,
      remainingSeconds: 40,
      mode: "differential",
    });
    fireEvent.click(await screen.findByRole("button", { name: /切换全量下载/ }));

    await waitFor(() => {
      expect(switchToFullDownload).toHaveBeenCalled();
    });
  });

  it("installs immediately when checking again after download completes", async () => {
    const listeners: Array<(status: DesktopUpdateStatus) => void> = [];
    const quitAndInstall = vi.fn(async () => undefined);
    window.autoEmailSender = buildDesktopApi({
      checkForUpdate: async () => ({
        state: "downloaded_pending_install",
        version: "0.1.0",
        nextVersion: "0.1.1",
        fullDownloadBytes: 200,
      }),
      quitAndInstall,
      onUpdateStatus: (callback) => {
        listeners.push(callback);
        return () => undefined;
      },
    });

    render(<DesktopUpdateButton />);
    listeners[0]?.({
      state: "downloaded_pending_install",
      version: "0.1.0",
      nextVersion: "0.1.1",
      fullDownloadBytes: 200,
    });
    fireEvent.click(await screen.findByRole("button", { name: /检查更新/ }));

    await waitFor(() => {
      expect(quitAndInstall).toHaveBeenCalled();
    });
  });

  it("shows an error notification when update check fails", async () => {
    window.autoEmailSender = buildDesktopApi({
      checkForUpdate: async () => {
        throw new Error("invalid update metadata");
      },
    });

    render(<DesktopUpdateButton />);
    fireEvent.click(await screen.findByRole("button", { name: /检查更新/ }));

    await waitFor(() => {
      expect(notifyError).toHaveBeenCalledWith("检查更新失败", "invalid update metadata");
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("suggests checking the system proxy when update check hits a connection error", async () => {
    window.autoEmailSender = buildDesktopApi({
      checkForUpdate: async () => {
        throw new Error("connection error");
      },
    });

    render(<DesktopUpdateButton />);
    fireEvent.click(await screen.findByRole("button", { name: /检查更新/ }));

    await waitFor(() => {
      expect(notifyError).toHaveBeenCalledWith(
        "检查更新失败",
        "connection error。请检查系统代理是否已开启，或确认当前网络可以访问 GitHub。",
      );
    });
  });
});

function buildDesktopApi(overrides: Partial<NonNullable<typeof window.autoEmailSender>> = {}) {
  return {
    backendBaseUrl: "http://127.0.0.1:48123",
    getVersion: async () => "0.1.0",
    checkForUpdate: async () => ({ state: "not_available" as const, version: "0.1.0" }),
    downloadUpdate: async () => ({ state: "not_available" as const, version: "0.1.0" }),
    switchToFullDownload: async () => ({ state: "not_available" as const, version: "0.1.0" }),
    quitAndInstall: async () => undefined,
    onUpdateStatus: () => () => undefined,
    ...overrides,
  };
}
