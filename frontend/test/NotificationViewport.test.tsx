import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotificationProvider,
  useNotification,
} from "@/context/NotificationContext";

const Harness = () => {
  const {
    notifySuccess,
    notifyError,
    notifyFormErrors,
  } = useNotification();

  return (
    <div>
      <button type="button" onClick={() => notifySuccess("第一条", "第一条内容")}>
        第一条
      </button>
      <button type="button" onClick={() => notifySuccess("第二条", "第二条内容")}>
        第二条
      </button>
      <button type="button" onClick={() => notifySuccess("第三条", "第三条内容")}>
        第三条
      </button>
      <button type="button" onClick={() => notifySuccess("第四条", "第四条内容")}>
        第四条
      </button>
      <button type="button" onClick={() => notifySuccess("第五条", "第五条内容")}>
        第五条
      </button>
      <button
        type="button"
        onClick={() =>
          notifyFormErrors("请检查表单", ["请输入任务名称", "请选择开始时间"])
        }
      >
        表单错误
      </button>
      <button
        type="button"
        onClick={() => notifyError("复制这条报错", "这里有一段较长的报错正文。")}
      >
        长报错
      </button>
    </div>
  );
};

describe("NotificationViewport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("shows only the latest four notifications and keeps the newest at the bottom", () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );

    for (const label of ["第一条", "第二条", "第三条", "第四条", "第五条"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }

    const titles = screen
      .getAllByTestId("notification-title")
      .map((node) => node.textContent);

    expect(titles).toEqual(["第二条", "第三条", "第四条", "第五条"]);
  });

  it("renders aggregated form errors as one notification card", () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "表单错误" }));

    const card = screen.getByTestId("notification-card");
    expect(within(card).getByText("请检查表单")).toBeInTheDocument();
    expect(within(card).getByText("请输入任务名称")).toBeInTheDocument();
    expect(within(card).getByText("请选择开始时间")).toBeInTheDocument();
  });

  it("auto-dismisses untouched notifications but keeps hovered notifications sticky", () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "长报错" }));

    const card = screen.getByTestId("notification-card");
    fireEvent.mouseEnter(card);
    vi.advanceTimersByTime(10000);

    expect(screen.getByText("复制这条报错")).toBeInTheDocument();

    fireEvent.click(
      within(card).getByRole("button", { name: "关闭提示" }),
    );
    vi.advanceTimersByTime(200);

    expect(screen.queryByText("复制这条报错")).not.toBeInTheDocument();
  });
});
