import { Extension } from "@tiptap/core";
import "@tiptap/extension-text-style";

export const TextColor = Extension.create({
  name: "textColor",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => element.style.color || element.getAttribute("color") || null,
            renderHTML: (attributes) =>
              attributes.color ? { style: `color:${attributes.color}` } : {},
          },
        },
      },
    ];
  },
});
