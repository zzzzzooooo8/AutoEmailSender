import { useEffect, useId, useRef } from "react";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered } from "lucide-react";
import { deriveTextFromEmailHtml, normalizeEmailHtml } from "@/lib/richEmail";

export type RichEmailValue = {
  html: string;
  text: string;
};

type RichEmailEditorProps = {
  label: string;
  html: string;
  onChange: (value: RichEmailValue) => void;
};

export const RichEmailEditor = ({
  label,
  html,
  onChange,
}: RichEmailEditorProps) => {
  const labelId = useId();
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [html]);

  const emitChange = () => {
    const nextHtml = normalizeEmailHtml(editorRef.current?.innerHTML ?? "");
    onChange({
      html: nextHtml,
      text: deriveTextFromEmailHtml(nextHtml),
    });
  };

  const applyCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    emitChange();
  };

  return (
    <div className="block">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <label id={labelId} className="text-sm font-medium text-stone-800">
          {label}
        </label>
        <div className="flex flex-wrap gap-1 rounded-2xl border border-stone-200 bg-stone-50 p-1">
          <button
            type="button"
            aria-label="加粗"
            onClick={() => applyCommand("bold")}
            className="rounded-xl p-2 text-stone-600 hover:bg-white"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="斜体"
            onClick={() => applyCommand("italic")}
            className="rounded-xl p-2 text-stone-600 hover:bg-white"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="无序列表"
            onClick={() => applyCommand("insertUnorderedList")}
            className="rounded-xl p-2 text-stone-600 hover:bg-white"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="有序列表"
            onClick={() => applyCommand("insertOrderedList")}
            className="rounded-xl p-2 text-stone-600 hover:bg-white"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="插入链接"
            onClick={() => {
              const href = window.prompt("请输入链接地址");
              if (href) {
                applyCommand("createLink", href);
              }
            }}
            className="rounded-xl p-2 text-stone-600 hover:bg-white"
          >
            <LinkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-labelledby={labelId}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        className="min-h-[320px] rounded-[28px] border border-stone-200 bg-white px-4 py-4 text-sm leading-7 text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </div>
  );
};
