import { Extension } from "@tiptap/core";

export const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "tableCell", "tableHeader"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) =>
              attributes.lineHeight ? { style: `line-height:${attributes.lineHeight}` } : {},
          },
        },
      },
    ];
  },
});
