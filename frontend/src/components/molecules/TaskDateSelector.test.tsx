import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskDateSelector } from "./TaskDateSelector";

describe("TaskDateSelector", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps range rules, calendar meaning, rest-day labels, and outside-month days clear", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T08:00:00+08:00"));

    render(<TaskDateSelector selectedDates={["2026-05-08"]} onChange={vi.fn()} />);

    expect(screen.getByText("按范围快速选择")).toBeInTheDocument();
    expect(screen.getByText("先设置起止日期，再用规则批量生成发送日期。")).toBeInTheDocument();
    expect(screen.getByText("日历中高亮的日期会被安排发送；点击某一天可单独加入或移除。")).toBeInTheDocument();
    expect(screen.getByText("休息日")).toBeInTheDocument();
    expect(screen.getByText("调休补班")).toBeInTheDocument();
    expect(screen.queryByText("添加范围外日期")).not.toBeInTheDocument();

    const maySecond = screen.getByRole("button", { name: /2026-05-02.*休息日.*未选中/ });
    expect(within(maySecond).getByText("休")).toBeInTheDocument();

    const mayNinth = screen.getByRole("button", { name: /2026-05-09.*调休补班.*未选中/ });
    expect(within(mayNinth).getByText("班")).toBeInTheDocument();

    const mayEighth = screen.getByRole("button", { name: /2026-05-08.*已选中/ });
    expect(within(mayEighth).queryByText("占")).not.toBeInTheDocument();

    const aprilTwentySeven = screen.getByRole("button", { name: /2026-04-27.*非本月/ });
    expect(aprilTwentySeven).toHaveClass("opacity-50");
  });
});
