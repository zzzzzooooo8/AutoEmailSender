import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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

  it("does not rewrite the editor dom for local input echoes", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "innerHTML",
    );
    if (!originalDescriptor?.get || !originalDescriptor.set) {
      throw new Error("innerHTML descriptor unavailable");
    }

    let writeCount = 0;
    const trackedElements = new WeakSet<Element>();

    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      get: originalDescriptor.get,
      set(value) {
        if (trackedElements.has(this)) {
          writeCount += 1;
        }
        return originalDescriptor.set!.call(this, value);
      },
    });

    const Wrapper = () => {
      const [html, setHtml] = useState(
        '<table style="font-family:SimSun"><tbody><tr><td style="font-family:SimSun">老师您好</td></tr></tbody></table>',
      );
      return (
        <RichEmailEditor
          label="邮件正文"
          html={html}
          onChange={({ html: nextHtml }) => setHtml(nextHtml)}
        />
      );
    };

    try {
      render(<Wrapper />);

      const editor = screen.getByRole("textbox", { name: "邮件正文" });
      trackedElements.add(editor);
      writeCount = 0;

      editor.innerHTML =
        '<table style="font-family:SimSun"><tbody><tr><td style="font-family:SimSun">老师您好A</td></tr></tbody></table>';
      fireEvent.input(editor);

      expect(writeCount).toBe(1);
    } finally {
      Object.defineProperty(Element.prototype, "innerHTML", originalDescriptor);
    }
  });
});
