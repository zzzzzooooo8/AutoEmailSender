import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmailTemplateEditor } from "@/components/molecules/EmailTemplateEditor";

describe("EmailTemplateEditor", () => {
  it("renders the editor and toolbar controls", () => {
    render(
      <EmailTemplateEditor
        label="默认模板正文"
        html="<p>老师您好</p>"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "默认模板正文" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加粗" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "插入表格" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "HTML 预览" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "字体菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "字号菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "行距菜单" })).toHaveTextContent("行距");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("offers expanded typography choices with readable labels", () => {
    render(
      <EmailTemplateEditor
        label="邮件正文"
        html='<p style="line-height:1.5">老师您好</p>'
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "行距菜单" })).toHaveTextContent("1.5 倍行距");

    fireEvent.click(screen.getByRole("button", { name: "字号菜单" }));
    expect(screen.getByRole("button", { name: "10pt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "22pt" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "字体菜单" }));
    expect(screen.getByRole("button", { name: "黑体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arial" })).toBeInTheDocument();
  });

  it("shows table editing actions when editing a table", () => {
    render(
      <EmailTemplateEditor
        label="邮件正文"
        html="<p>老师您好</p>"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "插入表格" }));

    expect(screen.getByRole("group", { name: "表格操作" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上方插入行" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右侧插入列" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除表格" })).toBeInTheDocument();
  });

  it("renders known template tokens as inline placeholder chips", () => {
    render(
      <EmailTemplateEditor
        label="邮件正文"
        html="<p>{{name}}老师您好，我是{{sender_name}}。</p>"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("导师姓名")).toBeInTheDocument();
    expect(screen.getByText("发件人姓名")).toBeInTheDocument();
    expect(screen.queryByText("{{name}}")).not.toBeInTheDocument();
  });

  it("inserts placeholder chips and emits template tokens", () => {
    const handleChange = vi.fn();
    render(
      <EmailTemplateEditor
        label="邮件正文"
        html="<p>老师您好</p>"
        onChange={handleChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "占位符菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "导师姓名" }));

    expect(screen.getByText("导师姓名")).toBeInTheDocument();
    expect(handleChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("{{name}}"),
        text: expect.stringContaining("{{name}}"),
      }),
    );
  });

  it("renders the placeholder menu in a fixed portal to avoid clipped workspace panels", () => {
    render(
      <EmailTemplateEditor
        label="邮件正文"
        html="<p>老师您好</p>"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "占位符菜单" }));

    const menu = screen.getByTestId("email-template-placeholder-menu");
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass("fixed");
    expect(menu).toHaveClass("z-[80]");
  });
});
