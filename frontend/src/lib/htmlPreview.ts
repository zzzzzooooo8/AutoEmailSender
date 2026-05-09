import DOMPurify from "dompurify";

const PREVIEW_ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "font",
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
  "color",
  "face",
  "href",
  "rowspan",
  "size",
  "style",
  "target",
];

const normalizePreviewHtml = (value: string) =>
  value
    .replace(/\s+(?=<)/g, "")
    .replace(/style="([^"]*[^;"])"/g, 'style="$1;"')
    .trim();

const normalizePreviewText = (value: string) =>
  value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

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

export const extractPlainTextFromHtml = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed
    .replace(/\s+(?=<)/g, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");

  const sanitized = DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS: PREVIEW_ALLOWED_TAGS,
    ALLOWED_ATTR: PREVIEW_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script"],
  });

  const container = document.createElement("div");
  container.innerHTML = sanitized;
  return normalizePreviewText(container.textContent ?? "");
};

export const hasRenderablePreviewContent = (value: string): boolean => {
  if (!extractPlainTextFromHtml(value)) {
    return false;
  }
  return true;
};
