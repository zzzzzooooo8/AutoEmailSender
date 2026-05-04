import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopUpdateCard } from "@/components/molecules/DesktopUpdateCard";

describe("DesktopUpdateCard", () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, "autoEmailSender");
  });

  it("does not render in browser mode", () => {
    const { container } = render(<DesktopUpdateCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("checks update in desktop mode", async () => {
    const checkForUpdate = vi.fn(async () => ({
      state: "not_available" as const,
      version: "0.1.0",
    }));
    window.autoEmailSender = {
      backendBaseUrl: "http://127.0.0.1:48123",
      getVersion: async () => "0.1.0",
      checkForUpdate,
      downloadUpdate: async () => ({ state: "not_available", version: "0.1.0" }),
      quitAndInstall: async () => undefined,
      onUpdateStatus: () => () => undefined,
    };

    render(<DesktopUpdateCard />);

    expect(await screen.findByText("桌面应用更新")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /检查更新/ }));

    await waitFor(() => {
      expect(checkForUpdate).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("当前已是最新版本。")).toBeInTheDocument();
  });
});
