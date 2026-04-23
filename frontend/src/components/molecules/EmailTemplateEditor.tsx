import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import TableRow from "@tiptap/extension-table-row";
import { Bold, Italic, Link2, Table2, Underline as UnderlineIcon } from "lucide-react";
import { deriveTextFromEmailHtml } from "@/lib/richEmail";
import { FontFamily } from "@/components/molecules/tiptap/FontFamily";
import { FontSize } from "@/components/molecules/tiptap/FontSize";
import { LineHeight } from "@/components/molecules/tiptap/LineHeight";
import { FirstLineIndent } from "@/components/molecules/tiptap/FirstLineIndent";
import {
  EmailTable,
  EmailTableCell,
  EmailTableHeader,
} from "@/components/molecules/tiptap/EmailTable";
import {
  EMAIL_FIRST_LINE_INDENT_OPTIONS,
  EMAIL_FONT_OPTIONS,
  EMAIL_FONT_SIZE_OPTIONS,
  EMAIL_LINE_HEIGHT_OPTIONS,
} from "@/components/molecules/tiptap/emailEditorStyles";

type EmailTemplateEditorProps = {
  label: string;
  html: string;
  onChange: (value: { html: string; text: string }) => void;
};

export const EmailTemplateEditor = ({
  label,
  html,
  onChange,
}: EmailTemplateEditorProps) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Underline,
      TextStyle,
      TextAlign.configure({ types: ["paragraph"] }),
      EmailTable.configure({ resizable: true }),
      TableRow,
      EmailTableHeader,
      EmailTableCell,
      FontFamily,
      FontSize,
      LineHeight,
      FirstLineIndent,
    ],
    content: html,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[320px] rounded-[28px] border border-stone-200 bg-white px-4 py-4 text-sm leading-7 text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15",
        role: "textbox",
        "aria-label": label,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextHtml = currentEditor.getHTML();
      onChange({
        html: nextHtml,
        text: deriveTextFromEmailHtml(nextHtml),
      });
    },
  });

  useEffect(() => {
    if (editor && html !== editor.getHTML()) {
      editor.commands.setContent(html, false);
    }
  }, [editor, html]);

  const contentHtml = useMemo(() => editor?.getHTML() ?? html, [editor, html]);

  if (!editor) {
    return null;
  }

  return (
    <div className="block">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-stone-800">{label}</div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="字体"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              if (value) {
                editor.chain().focus().setMark("textStyle", { fontFamily: value }).run();
              }
            }}
          >
            <option value="">字体</option>
            {EMAIL_FONT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="字号"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              if (value) {
                editor.chain().focus().setMark("textStyle", { fontSize: value }).run();
              }
            }}
          >
            <option value="">字号</option>
            {EMAIL_FONT_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            aria-label="行距"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              if (value) {
                editor.chain().focus().updateAttributes("paragraph", { lineHeight: value }).run();
              }
            }}
          >
            <option value="">行距</option>
            {EMAIL_LINE_HEIGHT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            aria-label="首行缩进"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              editor
                .chain()
                .focus()
                .updateAttributes("paragraph", {
                  firstLineIndent: value === "0" ? null : value,
                })
                .run();
            }}
          >
            <option value="">首行缩进</option>
            {EMAIL_FIRST_LINE_INDENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1 rounded-2xl border border-stone-200 bg-stone-50 p-1">
        <button
          type="button"
          aria-label="加粗"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className="rounded-xl p-2 text-stone-600 hover:bg-white"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="斜体"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className="rounded-xl p-2 text-stone-600 hover:bg-white"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="下划线"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className="rounded-xl p-2 text-stone-600 hover:bg-white"
        >
          <UnderlineIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="插入链接"
          onClick={() =>
            editor
              .chain()
              .focus()
              .setLink({ href: "https://example.com" })
              .run()
          }
          className="rounded-xl p-2 text-stone-600 hover:bg-white"
        >
          <Link2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="插入表格"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
              .run()
          }
          className="rounded-xl p-2 text-stone-600 hover:bg-white"
        >
          <Table2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="HTML 预览"
          onClick={() => setPreviewOpen((current) => !current)}
          className="rounded-xl px-3 py-2 text-xs text-stone-600 hover:bg-white"
        >
          HTML 预览
        </button>
      </div>

      <EditorContent editor={editor} />

      {previewOpen ? (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
        </div>
      ) : null}
    </div>
  );
};
