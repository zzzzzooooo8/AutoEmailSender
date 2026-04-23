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
});
