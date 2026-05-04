import { AtSign, GraduationCap, Microscope } from "lucide-react";
import type { ReactNode } from "react";
import { normalizeProfessorTitleDisplay } from "@/lib/professorTitle";
import type { WorkspaceThreadDTO } from "@/types";

type WorkspaceSidebarProps = {
  thread: WorkspaceThreadDTO;
};

const fieldClassName =
  "rounded-[22px] border border-stone-200/80 bg-white/88 px-4 py-3 shadow-[0_18px_34px_-30px_rgba(41,37,36,0.2)]";

const ArchiveField = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) => (
  <div className={fieldClassName}>
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/8 text-primary">
        {icon}
      </span>
      {label}
    </div>
    <div className="mt-2 text-sm leading-6 text-stone-800">{value}</div>
  </div>
);

const ArchiveCard = ({ thread }: WorkspaceSidebarProps) => {
  const professor = thread.professor;
  const normalizedTitle = normalizeProfessorTitleDisplay(professor.title);
  const organization =
    [professor.university, professor.school].filter(Boolean).join(" / ") ||
    "未填写学校信息";

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-[30px] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,250,242,0.98),rgba(255,255,255,0.98))] shadow-[0_20px_40px_-32px_rgba(41,37,36,0.25)]">
        <div className="border-b border-stone-200/80 px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-base font-semibold text-white shadow-sm shadow-primary/20">
              {professor.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                老师档案
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-[0.01em] text-stone-950">
                {professor.name}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {normalizedTitle || "未填写职称"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <ArchiveField
            icon={<GraduationCap className="h-4 w-4" />}
            label="单位"
            value={organization}
          />
          <ArchiveField
            icon={<Microscope className="h-4 w-4" />}
            label="研究方向"
            value={professor.research_direction || "暂无研究方向信息"}
          />
          <ArchiveField
            icon={<AtSign className="h-4 w-4" />}
            label="邮箱"
            value={professor.email || "暂无邮箱"}
          />
        </div>
      </section>
    </div>
  );
};

export const WorkspaceSidebar = (props: WorkspaceSidebarProps) => (
  <>
    <div className="lg:hidden">
      <ArchiveCard {...props} />
    </div>

    <aside className="hidden lg:block">
      <div className="sticky top-0">
        <ArchiveCard {...props} />
      </div>
    </aside>
  </>
);
