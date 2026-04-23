import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichEmailEditor } from "@/components/molecules/RichEmailEditor";

describe("RichEmailEditor", () => {
  it("emits html and text after editing content", () => {
    const handleChange = vi.fn();

    render(
      <RichEmailEditor
        label="邮件正文"
        html="<p>王老师您好</p>"
        onChange={handleChange}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "邮件正文" });
    editor.innerHTML = "<p>王老师您好</p><p><strong>我很关注您的研究</strong></p>";
    fireEvent.input(editor);

    expect(handleChange).toHaveBeenLastCalledWith({
      html: "<p>王老师您好</p><p><strong>我很关注您的研究</strong></p>",
      text: "王老师您好\n我很关注您的研究",
    });
  });
});
