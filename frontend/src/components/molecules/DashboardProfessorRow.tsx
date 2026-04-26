import clsx from "clsx";
import { Loader2, Sparkles } from "lucide-react";
import { ProfessorIdentityBlock } from "@/components/molecules/ProfessorIdentityBlock";
import { SelectionToggleButton } from "@/components/molecules/SelectionToggleButton";
import type { ProfessorDashboardItemDTO } from "@/types";

type DashboardProfessorRowProps = {
  professor: ProfessorDashboardItemDTO;
  selected: boolean;
  bulkDisabled: boolean;
  scoring: boolean;
  canCalculateMatch: boolean;
  statusLabel: string;
  onToggleSelection: () => void;
  onCalculateMatch: () => void;
  onOpenWorkspace: () => void;
};

const formatMatchLabel = (score: number | null) =>
  score === null ? "匹配 未计算" : `匹配 ${score}%`;

const formatSentLabel = (sentCount: number) =>
  sentCount === 0 ? "未发送" : `已发送 ${sentCount} 次`;

export const DashboardProfessorRow = ({
  professor,
  selected,
  bulkDisabled,
  scoring,
  canCalculateMatch,
  statusLabel,
  onToggleSelection,
  onCalculateMatch,
  onOpenWorkspace,
}: DashboardProfessorRowProps) => (
  <article
    className={clsx(
      "grid gap-4 px-6 py-5 transition lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)_auto] lg:items-center",
      selected ? "bg-primary/5" : "bg-white hover:bg-[#fcfbf8]",
    )}
  >
    <div className="flex min-w-0 items-center gap-4">
      <SelectionToggleButton
        label={`选择 ${professor.name}`}
        selected={selected}
        onToggle={onToggleSelection}
      />
      <ProfessorIdentityBlock
        compact
        name={professor.name}
        title={professor.title}
        university={professor.university}
        school={professor.school}
        researchDirection={professor.research_direction}
      />
    </div>

    <div className="flex flex-wrap gap-2 lg:justify-start">
      <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-700">
        {formatMatchLabel(professor.match_score)}
      </span>
      <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600">
        {formatSentLabel(professor.sent_count)}
      </span>
      <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
        {statusLabel}
      </span>
    </div>

    <div className="flex flex-wrap items-center gap-3 lg:justify-end">
      <button
        type="button"
        onClick={onCalculateMatch}
        disabled={bulkDisabled || scoring || !canCalculateMatch}
        className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {scoring ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {canCalculateMatch ? "分析匹配度" : "缺少研究信息"}
      </button>
      <button
        type="button"
        onClick={onOpenWorkspace}
        disabled={bulkDisabled}
        className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        打开工作区
      </button>
    </div>
  </article>
);
