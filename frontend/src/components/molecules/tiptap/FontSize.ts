import { Extension } from "@tiptap/core";
import "@tiptap/extension-text-style";
import {
  extractFontSizeFromStyle,
  normalizeFontSizeValue,
} from "@/lib/fontSize";

export const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) =>
              normalizeFontSizeValue(
                element.style.fontSize ||
                  extractFontSizeFromStyle(element.getAttribute("style")) ||
                  element.getAttribute("size"),
              ) || null,
            renderHTML: (attributes) =>
              attributes.fontSize ? { style: `font-size:${attributes.fontSize}` } : {},
          },
        },
      },
    ];
  },
});
