import clsx from "clsx";
import type { ReactNode } from "react";
import { Archive, PencilLine, RotateCcw } from "lucide-react";
import { ProfessorIdentityBlock } from "@/components/molecules/ProfessorIdentityBlock";
import { SelectionToggleButton } from "@/components/molecules/SelectionToggleButton";
import { formatApiDateTime } from "@/lib/dateTime";
import type { ProfessorManagementItemDTO } from "@/types";

type ManagementProfessorRowProps = {
  professor: ProfessorManagementItemDTO;
  checked: boolean;
  selectable: boolean;
  tableColumns: string;
  onToggleSelection: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
};

type FieldCellProps = {
  label: string;
  valueClassName?: string;
  children: ReactNode;
};

const FieldCell = ({ label, valueClassName, children }: FieldCellProps) => (
  <div className="min-w-0 rounded-2xl bg-stone-50/70 px-3 py-2 lg:bg-transparent lg:px-0 lg:py-0">
    <div className="mb-1 text-[11px] font-medium text-stone-400 lg:hidden">
      {label}
    </div>
    <div className={valueClassName}>{children}</div>
  </div>
);

export const ManagementProfessorRow = ({
  professor,
  checked,
  selectable,
  tableColumns,
  onToggleSelection,
  onEdit,
  onArchive,
  onRestore,
}: ManagementProfessorRowProps) => {
  const schoolAndCollege = [professor.university, professor.school]
    .filter(Boolean)
    .join(" / ");

  return (
    <article
      className={clsx(
        "px-6 py-5 transition",
        professor.archived_at ? "bg-stone-50/65" : "bg-white",
      )}
    >
      <div className={clsx("grid gap-4 lg:items-center", tableColumns)}>
        <div className="flex items-center">
          <SelectionToggleButton
            label={`选择 ${professor.name}`}
            selected={checked}
            disabled={!selectable}
            onToggle={onToggleSelection}
          />
        </div>

        <ProfessorIdentityBlock
          compact
          name={professor.name}
          title={professor.title}
          university={professor.university}
          school={professor.school}
          researchDirection={professor.research_direction}
          archived={Boolean(professor.archived_at)}
        />

        <FieldCell label="邮箱" valueClassName="break-all text-sm text-stone-700">
          {professor.email || "未填写邮箱"}
        </FieldCell>

        <FieldCell
          label="学校 / 学院"
          valueClassName="break-words text-sm text-stone-600"
        >
          {schoolAndCollege || "未填写学校 / 学院"}
        </FieldCell>

        <FieldCell
          label="研究方向"
          valueClassName="line-clamp-3 text-sm leading-6 text-stone-600"
        >
          {professor.research_direction || "未填写研究方向"}
        </FieldCell>

        <FieldCell label="更新时间" valueClassName="text-sm text-stone-500">
          <div>{formatApiDateTime(professor.updated_at)}</div>
          {professor.archived_at ? (
            <div className="mt-2 text-xs text-amber-700">
              删除于 {formatApiDateTime(professor.archived_at)}
            </div>
          ) : null}
        </FieldCell>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button type="button" onClick={onEdit} className="ui-btn-secondary px-3 py-2">
            <PencilLine className="h-4 w-4" />
            编辑
          </button>
          {professor.archived_at ? (
            <button
              type="button"
              onClick={onRestore}
              className="ui-btn-secondary px-3 py-2"
            >
              <RotateCcw className="h-4 w-4" />
              恢复
            </button>
          ) : (
            <button type="button" onClick={onArchive} className="ui-btn-danger px-3 py-2">
              <Archive className="h-4 w-4" />
              移入回收站
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
