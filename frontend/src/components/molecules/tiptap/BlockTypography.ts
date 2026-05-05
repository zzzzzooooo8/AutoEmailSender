import { Extension } from "@tiptap/core";

export const BlockTypography = Extension.create({
  name: "blockTypography",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) => element.style.fontFamily || null,
            renderHTML: (attributes) =>
              attributes.fontFamily ? { style: `font-family:${attributes.fontFamily}` } : {},
          },
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) =>
              attributes.fontSize ? { style: `font-size:${attributes.fontSize}` } : {},
          },
        },
      },
    ];
  },
});
