import { describe, expect, it } from "vitest";
import {
  getTemplatePlaceholder,
  parseTemplatePlaceholderText,
  prepareTemplatePlaceholderHtml,
  serializeTemplatePlaceholderHtml,
} from "@/lib/templatePlaceholders";

describe("templatePlaceholders", () => {
  it("finds known placeholders and ignores unknown keys", () => {
    expect(getTemplatePlaceholder("name")?.label).toBe("导师姓名");
    expect(getTemplatePlaceholder("unknown")).toBeUndefined();
    expect(getTemplatePlaceholder(null)).toBeUndefined();
  });

  it("parses text into ordered text and placeholder segments with whitespace-tolerant tokens", () => {
    expect(parseTemplatePlaceholderText("您好 {{ name }}，我是{{sender_name}}。")).toEqual([
      { type: "text", value: "您好 " },
      { type: "placeholder", key: "name", label: "导师姓名", token: "{{name}}" },
      { type: "text", value: "，我是" },
      { type: "placeholder", key: "sender_name", label: "发件人姓名", token: "{{sender_name}}" },
      { type: "text", value: "。" },
    ]);
  });

  it("keeps unknown tokens as normal text while parsing", () => {
    expect(parseTemplatePlaceholderText("{{name}} 与 {{unknown}}")).toEqual([
      { type: "placeholder", key: "name", label: "导师姓名", token: "{{name}}" },
      { type: "text", value: " 与 {{unknown}}" },
    ]);
  });

  it("prepares and serializes placeholder spans without changing surrounding html", () => {
    const prepared = prepareTemplatePlaceholderHtml("<p>{{ name }}老师您好，我是{{sender_email}}</p>");

    expect(prepared).toBe(
      '<p><span data-template-placeholder="name">导师姓名</span>老师您好，我是<span data-template-placeholder="sender_email">发件邮箱</span></p>',
    );
    expect(serializeTemplatePlaceholderHtml(prepared)).toBe("<p>{{name}}老师您好，我是{{sender_email}}</p>");
  });
});
