import { describe, expect, it } from "vitest";
import {
  hasRenderablePreviewContent,
  sanitizeTemplateHtmlForPreview,
} from "@/lib/htmlPreview";

describe("sanitizeTemplateHtmlForPreview", () => {
  it("keeps placeholders and safe formatting", () => {
    const result = sanitizeTemplateHtmlForPreview(
      '<p style="text-align:left">{{name}}老师您好，<strong>我是{{sender_name}}</strong>。</p>',
    );

    expect(result).toContain("{{name}}老师您好");
    expect(result).toContain("{{sender_name}}");
    expect(result).toContain("<strong>");
    expect(result).toContain('style="text-align:left;"');
  });

  it("removes scripts, event handlers, and javascript urls", () => {
    const result = sanitizeTemplateHtmlForPreview(
      '<p onclick="alert(1)">正文</p><script>alert(1)</script><a href="javascript:alert(2)">链接</a>',
    );

    expect(result).toContain("正文");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("javascript:");
  });
});

describe("hasRenderablePreviewContent", () => {
  it("returns false for empty or fully stripped html", () => {
    expect(hasRenderablePreviewContent("")).toBe(false);
    expect(hasRenderablePreviewContent("<script>alert(1)</script>")).toBe(false);
  });

  it("returns true for visible html", () => {
    expect(hasRenderablePreviewContent("<p>{{name}}老师您好，</p>")).toBe(true);
  });
});
