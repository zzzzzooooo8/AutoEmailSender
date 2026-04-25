import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubjectTemplateInput } from "@/components/molecules/SubjectTemplateInput";

const ControlledSubjectInput = () => {
  const [value, setValue] = useState("申请与老师交流");

  return (
    <>
      <SubjectTemplateInput
        label="邮件主题"
        value={value}
        onChange={setValue}
        placeholder="例如：申请与{{name}}老师交流"
      />
      <output data-testid="subject-value">{value}</output>
    </>
  );
};

const setTextboxCursor = (textbox: HTMLElement, offset: number) => {
  const textNode = textbox.firstChild;
  if (!textNode) {
    throw new Error("textbox has no text node");
  }

  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  fireEvent.focus(textbox);
  fireEvent.keyUp(textbox);
};

describe("SubjectTemplateInput", () => {
  it("inserts placeholder tokens at the current cursor position", () => {
    render(<ControlledSubjectInput />);

    const textbox = screen.getByRole("textbox", { name: "邮件主题" });
    setTextboxCursor(textbox, 2);

    fireEvent.click(screen.getByRole("button", { name: "主题占位符菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "导师姓名" }));

    expect(screen.getByTestId("subject-value")).toHaveTextContent(
      "申请{{name}}与老师交流",
    );
    expect(textbox).toHaveTextContent("申请导师姓名与老师交流");
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

  it("renders known subject template tokens as inline placeholder chips", () => {
    render(
      <SubjectTemplateInput
        label="邮件主题"
        value="申请与{{name}}老师交流"
        onChange={vi.fn()}
        placeholder="例如：申请与{{name}}老师交流"
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "邮件主题" });
    expect(textbox).toHaveTextContent("申请与导师姓名老师交流");
    expect(screen.getByText("导师姓名")).toHaveClass("email-placeholder-chip");
    expect(screen.queryByText("{{name}}")).not.toBeInTheDocument();
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
