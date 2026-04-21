import DOMPurify from "dompurify";

const PREVIEW_ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "i",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const PREVIEW_ALLOWED_ATTR = [
  "align",
  "cellpadding",
  "cellspacing",
  "colspan",
  "href",
  "rowspan",
  "style",
  "target",
];

const normalizePreviewHtml = (value: string) =>
  value
    .replace(/\s+(?=<)/g, "")
    .replace(/style="([^"]*[^;"])"/g, 'style="$1;"')
    .trim();

export const sanitizeTemplateHtmlForPreview = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const sanitized = DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: PREVIEW_ALLOWED_TAGS,
    ALLOWED_ATTR: PREVIEW_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script"],
  });

  return normalizePreviewHtml(sanitized);
};

export const hasRenderablePreviewContent = (value: string): boolean => {
  const sanitized = sanitizeTemplateHtmlForPreview(value);
  if (!sanitized) {
    return false;
  }

  const container = document.createElement("div");
  container.innerHTML = sanitized;
  return Boolean(container.textContent?.trim());
};
