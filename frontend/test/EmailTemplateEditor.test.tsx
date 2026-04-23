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
    expect(screen.getByRole("button", { name: "HTML 预览" })).toBeInTheDocument();
  });

  it("preserves existing table html in the preview", () => {
    render(
      <EmailTemplateEditor
        label="邮件正文"
        html='<table style="font-family:SimSun"><tbody><tr><td>老师您好</td></tr></tbody></table>'
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "HTML 预览" }));

    const previewContainer = screen.getByRole("button", { name: "HTML 预览" }).closest("div")?.parentElement?.parentElement;
    expect(previewContainer?.innerHTML).toContain("<table");
    expect(previewContainer?.innerHTML).toContain("font-family: SimSun");
  });
});
