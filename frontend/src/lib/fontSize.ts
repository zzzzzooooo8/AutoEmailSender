const FONT_SIZE_MAP: Record<string, string> = {
  "1": "8pt",
  "2": "10pt",
  "3": "12pt",
  "4": "14pt",
  "5": "18pt",
  "6": "24pt",
  "7": "36pt",
};

const LEGACY_BASE_FONT_SIZE = 3;

export const normalizeFontSizeValue = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[+-]\d+$/.test(trimmed)) {
    const relativeSize = Number(trimmed);
    const normalizedSize = Math.min(7, Math.max(1, LEGACY_BASE_FONT_SIZE + relativeSize));
    return FONT_SIZE_MAP[String(normalizedSize)] ?? null;
  }

  if (/^[1-7]$/.test(trimmed)) {
    return FONT_SIZE_MAP[trimmed] ?? null;
  }

  if (/^[0-9.]+(px|pt|em|rem|%)$/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
};

export const extractFontSizeFromStyle = (styleValue: string | null | undefined) => {
  const trimmed = styleValue?.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/(?:^|;)\s*font-size\s*:\s*([^;]+)/i);
  return match?.[1]?.trim() ?? null;
};

export const normalizeFontSizeStyle = (styleValue: string | null | undefined) => {
  const trimmed = styleValue?.trim();
  if (!trimmed) {
    return null;
  }

  const declarations = trimmed
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(":");
      if (separatorIndex < 0) {
        return declaration;
      }

      const property = declaration.slice(0, separatorIndex).trim();
      const value = declaration.slice(separatorIndex + 1).trim();

      if (!property) {
        return null;
      }

      if (property.toLowerCase() === "font-size") {
        const normalizedValue = normalizeFontSizeValue(value);
        return normalizedValue ? `font-size:${normalizedValue}` : null;
      }

      return `${property}:${value}`;
    })
    .filter((declaration): declaration is string => Boolean(declaration));

  return declarations.length > 0 ? `${declarations.join(";")};` : null;
};
