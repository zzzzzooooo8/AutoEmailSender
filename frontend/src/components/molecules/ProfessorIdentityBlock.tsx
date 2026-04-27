import clsx from "clsx";
import { normalizeProfessorTitleDisplay } from "@/lib/professorTitle";

type ProfessorIdentityBlockProps = {
  name: string;
  title?: string | null;
  university?: string | null;
  school?: string | null;
  researchDirection?: string | null;
  archived?: boolean;
  compact?: boolean;
  showAffiliation?: boolean;
  showResearchDirection?: boolean;
  className?: string;
};

export const ProfessorIdentityBlock = ({
  name,
  title,
  university,
  school,
  researchDirection,
  archived = false,
  compact = false,
  showAffiliation = true,
  showResearchDirection = true,
  className,
}: ProfessorIdentityBlockProps) => {
  const normalizedTitle = normalizeProfessorTitleDisplay(title);
  const affiliation = [normalizedTitle, university, school].filter(Boolean).join(" / ");

  return (
    <div className={clsx("min-w-0", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          className={clsx(
            "min-w-0 truncate font-semibold text-stone-900",
            compact ? "text-base" : "text-lg",
          )}
        >
          {name}
        </div>
        {archived ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
            已删除
          </span>
        ) : null}
      </div>
      {showAffiliation ? (
        <div className="mt-1 text-sm text-stone-500">
          {affiliation || "未填写职称 / 学校 / 学院"}
        </div>
      ) : normalizedTitle ? (
        <div className="mt-1 text-sm text-stone-500">{normalizedTitle}</div>
      ) : null}
      {showResearchDirection ? (
        <p
          className={clsx(
            "mt-2 text-sm leading-6 text-stone-600",
            compact ? "line-clamp-2" : "line-clamp-3",
          )}
        >
          {researchDirection || "暂无研究方向描述"}
        </p>
      ) : null}
    </div>
  );
};
