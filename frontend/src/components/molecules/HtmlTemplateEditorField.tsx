import { useState } from "react";
import clsx from "clsx";
import {
  hasRenderablePreviewContent,
  sanitizeTemplateHtmlForPreview,
} from "@/lib/htmlPreview";

type HtmlTemplateEditorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export const HtmlTemplateEditorField = ({
  label,
  value,
  onChange,
  placeholder,
}: HtmlTemplateEditorFieldProps) => {
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
  const previewHtml = sanitizeTemplateHtmlForPreview(value);
  const hasPreview = hasRenderablePreviewContent(value);

  return (
    <div className="block">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-stone-900">{label}</div>
        <div className="inline-flex rounded-full border border-stone-200 bg-stone-50 p-1">
          {[
            ["preview", "渲染预览"],
            ["source", "原 HTML"],
          ].map(([mode, title]) => {
            const active = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                onClick={() => setViewMode(mode as "preview" | "source")}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-stone-900 text-white"
                    : "text-stone-500 hover:text-stone-800",
                )}
              >
                {title}
              </button>
            );
          })}
        </div>
      </div>

      {viewMode === "preview" ? (
        <div className="mt-3">
          {hasPreview ? (
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-7 text-stone-700 shadow-sm">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/85 px-4 py-5 text-sm leading-6 text-stone-500">
              当前还没有 HTML 正文，切换到“原 HTML”后可直接粘贴或编辑。
            </div>
          )}
          <p className="mt-2 text-xs leading-6 text-stone-500">
            预览仅用于检查排版；如需修改，请切换到“原 HTML”。
          </p>
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-3 min-h-56 w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 font-mono text-sm text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          placeholder={placeholder}
        />
      )}
    </div>
  );
};
