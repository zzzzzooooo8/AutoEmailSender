import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubjectTemplateInput } from "@/components/molecules/SubjectTemplateInput";

const ControlledSubjectInput = () => {
  const [value, setValue] = useState("申请与老师交流");

  return (
    <SubjectTemplateInput
      label="邮件主题"
      value={value}
      onChange={setValue}
      placeholder="例如：申请与{{name}}老师交流"
    />
  );
};

describe("SubjectTemplateInput", () => {
  it("inserts placeholder tokens at the current cursor position", () => {
    render(<ControlledSubjectInput />);

    const input = screen.getByRole("textbox", { name: "邮件主题" }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(2, 2);

    fireEvent.click(screen.getByRole("button", { name: "主题占位符菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "导师姓名" }));

    expect(input).toHaveValue("申请{{name}}与老师交流");
  });

  it("emits tokenized subject values through onChange", () => {
    const handleChange = vi.fn();
    render(
      <SubjectTemplateInput
        label="默认模板主题"
        value=""
        onChange={handleChange}
        placeholder="例如：申请与{{name}}老师交流"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "主题占位符菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "发件人姓名" }));

    expect(handleChange).toHaveBeenCalledWith("{{sender_name}}");
  });

  it("renders the placeholder menu in a fixed portal to avoid clipped workspace panels", () => {
    render(<ControlledSubjectInput />);

    fireEvent.click(screen.getByRole("button", { name: "主题占位符菜单" }));

    const menu = screen.getByTestId("subject-placeholder-menu");
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass("fixed");
    expect(menu).toHaveClass("z-[80]");
  });
});
