import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { HtmlTemplateEditorField } from "@/components/molecules/HtmlTemplateEditorField";

const ControlledField = ({ initialValue }: { initialValue: string }) => {
  const [value, setValue] = useState(initialValue);

  return (
    <HtmlTemplateEditorField
      label="默认模板正文（HTML，可保留格式）"
      value={value}
      onChange={setValue}
      placeholder="<p>{{name}}老师您好，</p>"
    />
  );
};

describe("HtmlTemplateEditorField", () => {
  it("defaults to preview mode and hides the textarea", () => {
    render(<ControlledField initialValue="<p>{{name}}老师您好，</p>" />);

    expect(screen.getByRole("button", { name: "渲染预览" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("{{name}}老师您好，")).toBeInTheDocument();
  });

  it("keeps preview mode read-only until the user switches to 原 HTML", () => {
    render(<ControlledField initialValue="<p>只读预览</p>" />);

    expect(screen.getByText("只读预览")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the source textarea only after switching to 原 HTML", () => {
    render(<ControlledField initialValue="<p>初始正文</p>" />);

    fireEvent.click(screen.getByRole("button", { name: "原 HTML" }));

    expect(screen.getByRole("textbox")).toHaveValue("<p>初始正文</p>");
  });

  it("updates the preview after editing the source", () => {
    render(<ControlledField initialValue="<p>旧正文</p>" />);

    fireEvent.click(screen.getByRole("button", { name: "原 HTML" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "<p>更新后的正文</p>" },
    });
    fireEvent.click(screen.getByRole("button", { name: "渲染预览" }));

    expect(screen.getByText("更新后的正文")).toBeInTheDocument();
  });

  it("shows the preview empty state when there is no html", () => {
    render(<ControlledField initialValue="" />);

    expect(
      screen.getByText("当前还没有 HTML 正文，切换到“原 HTML”后可直接粘贴或编辑。"),
    ).toBeInTheDocument();
  });
});
