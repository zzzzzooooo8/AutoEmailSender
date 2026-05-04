import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopUpdateButton } from "@/components/molecules/DesktopUpdateButton";

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

  it("opens a confirmation dialog and keeps NEW when update is available", async () => {
    window.autoEmailSender = buildDesktopApi({
      checkForUpdate: async () => ({
        state: "available",
        version: "0.1.0",
        nextVersion: "0.1.1",
      }),
    });

    render(<DesktopUpdateButton />);
    fireEvent.click(await screen.findByRole("button", { name: /检查更新/ }));

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "发现新版本",
          confirmLabel: "下载并安装",
        }),
      );
    });
    expect(await screen.findByText("NEW")).toBeInTheDocument();
    expect(window.localStorage.getItem("desktop_pending_update_version")).toBe("0.1.1");
  });

  it("shows an error notification when update check fails", async () => {
    window.autoEmailSender = buildDesktopApi({
      checkForUpdate: async () => {
        throw new Error("network offline");
      },
    });

    render(<DesktopUpdateButton />);
    fireEvent.click(await screen.findByRole("button", { name: /检查更新/ }));

    await waitFor(() => {
      expect(notifyError).toHaveBeenCalledWith("检查更新失败", "network offline");
    });
    expect(confirm).not.toHaveBeenCalled();
  });
});

function buildDesktopApi(overrides: Partial<NonNullable<typeof window.autoEmailSender>>) {
  return {
    backendBaseUrl: "http://127.0.0.1:48123",
    getVersion: async () => "0.1.0",
    checkForUpdate: async () => ({ state: "not_available" as const, version: "0.1.0" }),
    downloadUpdate: async () => ({ state: "not_available" as const, version: "0.1.0" }),
    quitAndInstall: async () => undefined,
    onUpdateStatus: () => () => undefined,
    ...overrides,
  };
}
