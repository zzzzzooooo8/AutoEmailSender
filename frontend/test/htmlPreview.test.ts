import { describe, expect, it } from "vitest";
import {
  extractPlainTextFromHtml,
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

  it("preserves font tags and color attrs in previews", () => {
    const result = sanitizeTemplateHtmlForPreview(
      '<p><font face="宋体" color="#333333">老师您好</font></p>',
    );

    expect(result).toContain("<font");
    expect(result).toContain('face="宋体"');
    expect(result).toContain('color="#333333"');
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

describe("extractPlainTextFromHtml", () => {
  it("converts html document content to readable text", () => {
    expect(
      extractPlainTextFromHtml(
        '<html><body><p>老师回复</p><p><strong>欢迎继续交流</strong></p></body></html>',
      ),
    ).toBe("老师回复 欢迎继续交流");
  });
});
