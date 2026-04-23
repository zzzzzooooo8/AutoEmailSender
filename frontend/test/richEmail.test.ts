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
});
