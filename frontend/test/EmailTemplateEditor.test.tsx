import { render, screen } from "@testing-library/react";
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
});
