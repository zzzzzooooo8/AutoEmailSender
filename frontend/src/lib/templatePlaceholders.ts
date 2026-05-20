import {
  normalizeFontSizeStyle,
  normalizeFontSizeValue,
} from "@/lib/fontSize";

export type TemplatePlaceholderKey =
  | "name"
  | "email"
  | "title"
  | "university"
  | "school"
  | "department"
  | "research_direction"
  | "sender_name"
  | "sender_email"
  | "year"
  | "month"
  | "day";

export type TemplatePlaceholderOption = {
  key: TemplatePlaceholderKey;
  label: string;
  token: string;
};

export type TemplatePlaceholderSegment =
  | { type: "text"; value: string }
  | {
      type: "placeholder";
      key: TemplatePlaceholderKey;
      label: string;
      token: string;
    };

export const TEMPLATE_PLACEHOLDER_OPTIONS: TemplatePlaceholderOption[] = [
  { key: "name", label: "导师姓名", token: "{{name}}" },
  { key: "email", label: "导师邮箱", token: "{{email}}" },
  { key: "title", label: "导师职称", token: "{{title}}" },
  { key: "university", label: "导师学校", token: "{{university}}" },
  { key: "school", label: "导师学院", token: "{{school}}" },
  { key: "department", label: "导师院系", token: "{{department}}" },
  { key: "research_direction", label: "研究方向", token: "{{research_direction}}" },
  { key: "sender_name", label: "发件人姓名", token: "{{sender_name}}" },
  { key: "sender_email", label: "发件邮箱", token: "{{sender_email}}" },
  { key: "year", label: "发送年份", token: "{{year}}" },
  { key: "month", label: "发送月份", token: "{{month}}" },
  { key: "day", label: "发送日期", token: "{{day}}" },
];

export const getTemplatePlaceholder = (key: string | null | undefined) =>
  TEMPLATE_PLACEHOLDER_OPTIONS.find((option) => option.key === key);

const createTemplateTokenPattern = () =>
  /\{\{\s*(name|email|title|university|school|department|research_direction|sender_name|sender_email|year|month|day)\s*\}\}/g;

export const parseTemplatePlaceholderText = (text: string) => {
  const segments: TemplatePlaceholderSegment[] = [];
  const tokenPattern = createTemplateTokenPattern();
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    const [token, key] = match as RegExpExecArray & [string, TemplatePlaceholderKey];

    if (match.index > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, match.index) });
    }

    const option = getTemplatePlaceholder(key);
    if (option) {
      segments.push({
        type: "placeholder",
        key,
        label: option.label,
        token: option.token,
      });
    } else {
      segments.push({ type: "text", value: token });
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) });
  }

  return segments;
};

export const prepareTemplatePlaceholderHtml = (html: string) =>
  html.replace(createTemplateTokenPattern(), (_match, key: TemplatePlaceholderKey) => {
    const option = getTemplatePlaceholder(key);
    return `<span data-template-placeholder="${key}">${option?.label ?? key}</span>`;
  });

const convertFontTagsToSpanStyles = (html: string) => {
  const container = document.createElement("div");
  container.innerHTML = html;

  container.querySelectorAll("font").forEach((fontElement) => {
    const span = document.createElement("span");
    const styleParts: string[] = [];
    const face = fontElement.getAttribute("face")?.trim();
    const size = normalizeFontSizeValue(fontElement.getAttribute("size"));
    const color = fontElement.getAttribute("color")?.trim();
    const existingStyle = fontElement.getAttribute("style")?.trim();

    if (face) {
      styleParts.push(`font-family:${face}`);
    }
    if (size) {
      styleParts.push(`font-size:${size}`);
    }
    if (color) {
      styleParts.push(`color:${color}`);
    }
    if (existingStyle) {
      const normalizedStyle = normalizeFontSizeStyle(existingStyle);
      if (normalizedStyle) {
        styleParts.push(normalizedStyle.replace(/;+\s*$/, ""));
      }
    }
    if (styleParts.length > 0) {
      span.setAttribute("style", `${styleParts.join(";")};`);
    }

    while (fontElement.firstChild) {
      span.appendChild(fontElement.firstChild);
    }
    fontElement.replaceWith(span);
  });

  container.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const normalizedStyle = normalizeFontSizeStyle(element.getAttribute("style"));
    if (normalizedStyle) {
      element.setAttribute("style", normalizedStyle);
    }
  });

  return container.innerHTML;
};

export const prepareTemplateEditorHtml = (html: string) =>
  prepareTemplatePlaceholderHtml(convertFontTagsToSpanStyles(html));

export const serializeTemplatePlaceholderHtml = (html: string) =>
  html.replace(
    /<span[^>]*data-template-placeholder=["']([^"']+)["'][^>]*>.*?<\/span>/g,
    (_match, key: string) => getTemplatePlaceholder(key)?.token ?? "",
  );

const normalizeTemplatePlaceholderTokens = (html: string) =>
  html.replace(createTemplateTokenPattern(), (_match, key: TemplatePlaceholderKey) => {
    const option = getTemplatePlaceholder(key);
    return option?.token ?? `{{${key}}}`;
  });

export const areTemplatePlaceholderHtmlEquivalent = (leftHtml: string, rightHtml: string) =>
  normalizeTemplatePlaceholderTokens(serializeTemplatePlaceholderHtml(leftHtml)) ===
  normalizeTemplatePlaceholderTokens(serializeTemplatePlaceholderHtml(rightHtml));
