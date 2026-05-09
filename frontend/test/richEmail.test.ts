import { describe, expect, it } from "vitest";
import { deriveTextFromEmailHtml, normalizeEmailHtml } from "@/lib/richEmail";

describe("richEmail", () => {
  it("normalizes html and derives plain text", () => {
    const html = normalizeEmailHtml(
      "<p>王老师您好</p><script>alert(1)</script><ul><li>研究方向匹配</li></ul>",
    );

    expect(html).toBe("<p>王老师您好</p><ul><li>研究方向匹配</li></ul>");
    expect(deriveTextFromEmailHtml(html)).toBe("王老师您好\n- 研究方向匹配");
  });

  it("preserves table structure and inline font styles for email html", () => {
    const html = normalizeEmailHtml(
      '<table style="font-family:SimSun;border-collapse:collapse"><tbody><tr><td style="font-family:SimSun">老师您好</td></tr></tbody></table>',
    );

    expect(html).toContain("<table");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<tr>");
    expect(html).toContain("<td");
    expect(html).toContain('style="font-family:SimSun;border-collapse:collapse"');
    expect(html).toContain('style="font-family:SimSun"');
    expect(deriveTextFromEmailHtml(html)).toContain("老师您好");
  });

  it("preserves font tags and color attributes for imported html", () => {
    const html = normalizeEmailHtml(
      '<p><font face="宋体" color="#333333">老师您好</font></p>',
    );

    expect(html).toContain("<font");
    expect(html).toContain('face="宋体"');
    expect(html).toContain('color="#333333"');
    expect(deriveTextFromEmailHtml(html)).toBe("老师您好");
  });

  it("preserves imported word heading and paragraph styles", () => {
    const html = normalizeEmailHtml(
      '<h1 style="font-family:SimSun;font-size:16pt;text-align:center">标题</h1><p style="text-indent:2em;line-height:1.5;text-align:right">落款</p>',
    );

    expect(html).toContain("<h1");
    expect(html).toContain("font-size:16pt");
    expect(html).toContain("text-align:center");
    expect(html).toContain("text-indent:2em");
    expect(html).toContain("text-align:right");
    expect(deriveTextFromEmailHtml(html)).toBe("标题\n落款");
  });
});
