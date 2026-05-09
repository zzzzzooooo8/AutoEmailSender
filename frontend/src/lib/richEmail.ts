import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a",
  "b",
  "br",
  "font",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
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

const ALLOWED_ATTR = [
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

export const normalizeEmailHtml = (value: string): string =>
  DOMPurify.sanitize(value.trim(), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "style"],
  }).trim();

export const deriveTextFromEmailHtml = (value: string): string => {
  const container = document.createElement("div");
  container.innerHTML = value.trim();
  const lines: string[] = [];

  container.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li").forEach((element) => {
    const text = element.textContent?.replace(/\s+/g, " ").trim();
    if (!text) {
      return;
    }
    lines.push(element.tagName.toLowerCase() === "li" ? `- ${text}` : text);
  });

  if (lines.length > 0) {
    return lines.join("\n");
  }
  return container.textContent?.replace(/\s+/g, " ").trim() ?? "";
};

export const textToEmailHtml = (value: string): string =>
  value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
