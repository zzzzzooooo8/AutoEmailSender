import { Extension } from "@tiptap/core";
import "@tiptap/extension-text-style";

export const FontFamily = Extension.create({
  name: "fontFamily",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) =>
              element.style.fontFamily || element.getAttribute("face") || null,
            renderHTML: (attributes) =>
              attributes.fontFamily
                ? { style: `font-family:${attributes.fontFamily}` }
                : {},
          },
        },
      },
    ];
  },
});
