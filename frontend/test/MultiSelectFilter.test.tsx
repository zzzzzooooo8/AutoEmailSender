import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiSelectFilter } from "@/components/molecules/MultiSelectFilter";

describe("MultiSelectFilter", () => {
  it("shows all label when no values are selected", () => {
    render(
      <MultiSelectFilter
        label="学校"
        allLabel="全部学校"
        selectedValues={[]}
        options={["MIT", "Stanford"]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "学校：全部学校" })).toBeInTheDocument();
  });

  it("opens options and toggles values", async () => {
    const onToggle = vi.fn();

    render(
      <MultiSelectFilter
        label="学校"
        allLabel="全部学校"
        selectedValues={["MIT"]}
        options={["MIT", "Stanford"]}
        onToggle={onToggle}
        onClear={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "学校：MIT" }));

    const listbox = screen.getByRole("listbox", { name: "学校" });
    expect(within(listbox).getByRole("option", { name: "MIT" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(within(listbox).getByRole("option", { name: "Stanford" }));

    expect(onToggle).toHaveBeenCalledWith("Stanford");
  });

  it("summarizes multiple selected values and clears them", async () => {
    const onClear = vi.fn();

    render(
      <MultiSelectFilter
        label="职称"
        allLabel="全部职称"
        selectedValues={["教授", "副教授", "助理教授"]}
        options={["教授", "副教授", "助理教授"]}
        onToggle={vi.fn()}
        onClear={onClear}
      />,
    );

    expect(screen.getByRole("button", { name: "职称：教授 等 3 项" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "职称：教授 等 3 项" }));
    fireEvent.click(screen.getByRole("button", { name: "清空职称筛选" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
