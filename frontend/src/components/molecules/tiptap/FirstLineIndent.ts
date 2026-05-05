import { Extension } from "@tiptap/core";

export const FirstLineIndent = Extension.create({
  name: "firstLineIndent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          firstLineIndent: {
            default: null,
            parseHTML: (element) => element.style.textIndent || null,
            renderHTML: (attributes) =>
              attributes.firstLineIndent
                ? { style: `text-indent:${attributes.firstLineIndent}` }
                : {},
          },
        },
      },
    ];
  },
});
