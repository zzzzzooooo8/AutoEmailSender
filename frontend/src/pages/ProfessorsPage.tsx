import {
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import {
  Archive,
  Bot,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
  Minus,
  Plus,
  RefreshCcw,
  Search,
  Upload,
  Users,
} from "lucide-react";
import { NativeSelectField } from "@/components/atoms/NativeSelectField";
import { ManagementProfessorRow } from "@/components/molecules/ManagementProfessorRow";
import { useNotification } from "@/context/NotificationContext";
import { safeRecordUserAction } from "@/lib/diagnosticUserActions";
import {
  extractProfessorTitleTags,
  matchesProfessorTitleTag,
} from "@/lib/professorTitle";
import { useConfirmDialog } from "@/lib/useConfirmDialog";
import { createCrawlJob } from "@/lib/api/crawlJobsApi";
import {
  archiveProfessor,
  bulkArchiveProfessors,
  createProfessor,
  getProfessorTemplateDownloadUrl,
  importProfessorsFromFile,
  listProfessorsForManagement,
  restoreProfessor,
  updateProfessor,
} from "@/lib/api/professorsApi";
import type {
  CrawlJobEntryTypeDTO,
  ProfessorImportFileResultDTO,
  ProfessorManagementItemDTO,
  ProfessorUpsertPayloadDTO,
} from "@/types";

type ArchiveFilter = "active" | "archived" | "all";
type ProfessorFormState = {
  name: string;
  email: string;
  title: string;
  university: string;
  school: string;
  department: string;
  research_direction: string;
  recent_papers_text: string;
  profile_url: string;
  source_url: string;
};
type CrawlerJobFormState = {
  university: string;
  school: string;
  start_urls: string[];
  entry_type: CrawlJobEntryTypeDTO;
};

const PROFESSORS_PER_PAGE = 20;
const ALL_PROFESSOR_FILTER_VALUE = "__all__";
const managementTableColumns =
  "lg:grid-cols-[2.75rem_minmax(0,0.72fr)_minmax(0,0.74fr)_minmax(0,1.08fr)_minmax(0,1.18fr)_minmax(0,1.56fr)_minmax(0,0.78fr)_minmax(12rem,0.92fr)]";

const archiveFilterLabels: Record<ArchiveFilter, string> = {
  active: "正常",
  archived: "已删除",
  all: "全部",
};

const emptyProfessorForm = (): ProfessorFormState => ({
  name: "",
  email: "",
  title: "",
  university: "",
  school: "",
  department: "",
  research_direction: "",
  recent_papers_text: "",
  profile_url: "",
  source_url: "",
});

const emptyCrawlerJobForm = (): CrawlerJobFormState => ({
  university: "",
  school: "",
  start_urls: [""],
  entry_type: "list",
});

const normalizeCrawlerStartUrls = (urls: string[]) => {
  const seen = new Set<string>();
  return urls
    .map((url) => url.trim())
    .filter((url) => {
      if (!url || seen.has(url)) {
        return false;
      }
      seen.add(url);
      return true;
    });
};

const toProfessorForm = (
  professor: ProfessorManagementItemDTO,
): ProfessorFormState => ({
  name: professor.name,
  email: professor.email ?? "",
  title: professor.title ?? "",
  university: professor.university ?? "",
  school: professor.school ?? "",
  department: professor.department ?? "",
  research_direction: professor.research_direction ?? "",
  recent_papers_text: professor.recent_papers.join("\n"),
  profile_url: professor.profile_url ?? "",
  source_url: professor.source_url ?? "",
});

const toProfessorPayload = (
  form: ProfessorFormState,
): ProfessorUpsertPayloadDTO => ({
  name: form.name.trim(),
  email: form.email.trim(),
  title: form.title.trim() || null,
  university: form.university.trim() || null,
  school: form.school.trim() || null,
  department: form.department.trim() || null,
  research_direction: form.research_direction.trim() || null,
  recent_papers: form.recent_papers_text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean),
  profile_url: form.profile_url.trim() || null,
  source_url: form.source_url.trim() || null,
});

const fieldLabelClassName =
  "mb-2 inline-flex items-center gap-1 text-sm font-medium text-stone-800";
const filterFieldLabelClassName =
  "h-5 text-sm font-medium leading-5 text-stone-800";
const inputClassName =
  "w-full rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

const renderFieldLabel = (label: string, required = false) => (
  <span className={fieldLabelClassName}>
    {required ? (
      <span className="text-base leading-none text-red-500">*</span>
    ) : null}
    <span>{label}</span>
  </span>
);

const triggerDownload = (url: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const getActionErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const getSchoolPairValue = (professor: ProfessorManagementItemDTO) =>
  `${professor.university ?? ""}\t${professor.school ?? ""}`;

const getSchoolPairLabel = (professor: ProfessorManagementItemDTO) =>
  [professor.university, professor.school].filter(Boolean).join(" / ");

const ToolbarMenu = ({
  disabled,
  onDownload,
}: {
  disabled?: boolean;
  onDownload: (format: "xlsx" | "csv") => void;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((previous) => !previous)}
        className="ui-btn-secondary h-10 rounded-2xl disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Download className="h-4 w-4" />
        下载模板
        <ChevronDown
          className={clsx("h-4 w-4 transition", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 min-w-56 overflow-hidden rounded-3xl border border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(252,250,246,0.96))] p-2 shadow-[0_24px_44px_-28px_rgba(41,37,36,0.42)]">
          <button
            type="button"
            onClick={() => {
              onDownload("xlsx");
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-stone-700 transition hover:bg-stone-100/90 hover:text-stone-900"
          >
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span>
              下载 XLSX 模板
              <span className="mt-1 block text-xs text-stone-500">
                适合直接在 Excel 中填写
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onDownload("csv");
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-stone-700 transition hover:bg-stone-100/90 hover:text-stone-900"
          >
            <Download className="h-4 w-4 text-primary" />
            <span>
              下载 CSV 模板
              <span className="mt-1 block text-xs text-stone-500">
                适合脚本生成或轻量编辑
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
};

const ModalShell = ({
  open,
  title,
  description,
  onClose,
  children,
  maxWidthClassName = "max-w-3xl",
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
}) => {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className={clsx(
          "relative w-full overflow-hidden rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(255,245,233,0.96))] shadow-[0_34px_90px_-32px_rgba(41,37,36,0.5)]",
          maxWidthClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(153,27,27,0.15),transparent_70%)]" />
        <div className="relative max-h-[85vh] overflow-y-auto px-6 py-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-[0.01em] text-stone-900">
              {title}
            </h2>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {description}
              </p>
            ) : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

export const ProfessorsPage = () => {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { notifyError, notifySuccess, notifyWarning } = useNotification();
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [professors, setProfessors] = useState<ProfessorManagementItemDTO[]>(
    [],
  );
  const [keyword, setKeyword] = useState("");
  const [titleFilter, setTitleFilter] = useState(ALL_PROFESSOR_FILTER_VALUE);
  const [schoolPairFilter, setSchoolPairFilter] = useState(
    ALL_PROFESSOR_FILTER_VALUE,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [upsertModalOpen, setUpsertModalOpen] = useState(false);
  const [editingProfessor, setEditingProfessor] =
    useState<ProfessorManagementItemDTO | null>(null);
  const [formState, setFormState] =
    useState<ProfessorFormState>(emptyProfessorForm());
  const [savingProfessor, setSavingProfessor] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const [importResult, setImportResult] =
    useState<ProfessorImportFileResultDTO | null>(null);
  const [crawlerModalOpen, setCrawlerModalOpen] = useState(false);
  const [crawlerFormState, setCrawlerFormState] = useState<CrawlerJobFormState>(
    emptyCrawlerJobForm(),
  );
  const [creatingCrawlJob, setCreatingCrawlJob] = useState(false);
  const loadProfessors = useCallback(
    async (filter: ArchiveFilter = archiveFilter) => {
      setLoading(true);
      try {
        const data = await listProfessorsForManagement(filter);
        setProfessors(data);
        setSelectedIds((previous) => {
          const next = new Set<number>();
          data.forEach((item) => {
            if (item.archived_at) {
              return;
            }
            if (previous.has(item.id)) {
              next.add(item.id);
            }
          });
          return next;
        });
      } catch (loadError) {
        const message = getActionErrorMessage(loadError, "加载导师列表失败");
        notifyError("加载导师列表失败", message);
      } finally {
        setLoading(false);
      }
    },
    [archiveFilter, notifyError],
  );

  useEffect(() => {
    void loadProfessors();
  }, [loadProfessors]);

  const titleOptions = useMemo(
    () =>
      Array.from(
        new Set(
          professors
            .flatMap((professor) => extractProfessorTitleTags(professor.title))
            .filter((title): title is string => Boolean(title)),
        ),
      ).sort((first, second) => first.localeCompare(second)),
    [professors],
  );

  const schoolPairOptions = useMemo(() => {
    const pairMap = new Map<string, string>();
    professors.forEach((professor) => {
      const label = getSchoolPairLabel(professor);
      if (!label) {
        return;
      }
      pairMap.set(getSchoolPairValue(professor), label);
    });
    return Array.from(pairMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label));
  }, [professors]);

  const hasAdvancedFilters =
    titleFilter !== ALL_PROFESSOR_FILTER_VALUE ||
    schoolPairFilter !== ALL_PROFESSOR_FILTER_VALUE;

  const filteredProfessors = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return professors.filter((professor) => {
      const textMatched =
        !query ||
        [
          professor.name,
          professor.email,
          professor.university,
          professor.school,
          professor.department,
          professor.research_direction,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query));
      const titleMatched =
        titleFilter === ALL_PROFESSOR_FILTER_VALUE ||
        matchesProfessorTitleTag(professor.title, titleFilter);
      const schoolPairMatched =
        schoolPairFilter === ALL_PROFESSOR_FILTER_VALUE ||
        getSchoolPairValue(professor) === schoolPairFilter;

      return textMatched && titleMatched && schoolPairMatched;
    });
  }, [keyword, professors, schoolPairFilter, titleFilter]);

  const resetAdvancedFilters = () => {
    setTitleFilter(ALL_PROFESSOR_FILTER_VALUE);
    setSchoolPairFilter(ALL_PROFESSOR_FILTER_VALUE);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [archiveFilter, keyword, schoolPairFilter, titleFilter]);

  useEffect(() => {
    if (
      titleFilter !== ALL_PROFESSOR_FILTER_VALUE &&
      !titleOptions.includes(titleFilter)
    ) {
      setTitleFilter(ALL_PROFESSOR_FILTER_VALUE);
    }
  }, [titleFilter, titleOptions]);

  useEffect(() => {
    if (
      schoolPairFilter !== ALL_PROFESSOR_FILTER_VALUE &&
      !schoolPairOptions.some((option) => option.value === schoolPairFilter)
    ) {
      setSchoolPairFilter(ALL_PROFESSOR_FILTER_VALUE);
    }
  }, [schoolPairFilter, schoolPairOptions]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProfessors.length / PROFESSORS_PER_PAGE),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedProfessors = filteredProfessors.slice(
    (safeCurrentPage - 1) * PROFESSORS_PER_PAGE,
    safeCurrentPage * PROFESSORS_PER_PAGE,
  );
  const currentPageSelectableIds = paginatedProfessors
    .filter((professor) => !professor.archived_at)
    .map((professor) => professor.id);
  const allCurrentPageSelected =
    currentPageSelectableIds.length > 0 &&
    currentPageSelectableIds.every((id) => selectedIds.has(id));
  const openCreateModal = () => {
    setEditingProfessor(null);
    setFormState(emptyProfessorForm());
    setUpsertModalOpen(true);
  };

  const handleToggleSelectCurrentPage = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allCurrentPageSelected) {
        currentPageSelectableIds.forEach((id) => next.delete(id));
      } else {
        currentPageSelectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };
  const openEditModal = (professor: ProfessorManagementItemDTO) => {
    setEditingProfessor(professor);
    setFormState(toProfessorForm(professor));
    setUpsertModalOpen(true);
  };

  const closeUpsertModal = () => {
    if (savingProfessor) {
      return;
    }
    setUpsertModalOpen(false);
  };

  const handleSaveProfessor = async () => {
    setSavingProfessor(true);
    try {
      const payload = toProfessorPayload(formState);
      if (editingProfessor) {
        await updateProfessor(editingProfessor.id, payload);
        notifySuccess("保存成功", `已更新导师“${payload.name}”。`);
      } else {
        await createProfessor(payload);
        notifySuccess("保存成功", `已新增导师“${payload.name}”。`);
      }
      setUpsertModalOpen(false);
      await loadProfessors();
    } catch (saveError) {
      notifyError(
        "保存导师失败",
        getActionErrorMessage(saveError, "保存导师失败"),
      );
    } finally {
      setSavingProfessor(false);
    }
  };

  const handleArchiveProfessor = async (
    professor: ProfessorManagementItemDTO,
  ) => {
    const confirmed = await confirm({
      title: `将“${professor.name}”移入回收站？`,
      description:
        "移入回收站后，这位导师会从首页与正常列表中隐藏，但历史任务和通信会保留。",
      confirmLabel: "确认移入",
      cancelLabel: "先不处理",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    try {
      const result = await archiveProfessor(professor.id);
      notifySuccess("操作成功", result.message);
      await loadProfessors();
    } catch (archiveError) {
      notifyError(
        "移入回收站失败",
        getActionErrorMessage(archiveError, "移入回收站失败"),
      );
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) {
      return;
    }
    const confirmed = await confirm({
      title: `将选中的 ${selectedIds.size} 位导师移入回收站？`,
      description: "移入后会从首页与正常列表中隐藏，但历史任务和通信不会删除。",
      confirmLabel: "确认移入",
      cancelLabel: "先不处理",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    try {
      const result = await bulkArchiveProfessors({ ids: [...selectedIds] });
      setSelectedIds(new Set());
      notifySuccess("操作成功", result.message);
      await loadProfessors();
    } catch (archiveError) {
      notifyError(
        "批量移入回收站失败",
        getActionErrorMessage(archiveError, "批量移入回收站失败"),
      );
    }
  };

  const handleRestoreProfessor = async (
    professor: ProfessorManagementItemDTO,
  ) => {
    try {
      const result = await restoreProfessor(professor.id);
      notifySuccess("操作成功", result.message);
      await loadProfessors();
    } catch (restoreError) {
      notifyError(
        "恢复导师失败",
        getActionErrorMessage(restoreError, "恢复导师失败"),
      );
    }
  };

  const handleDownloadTemplate = (format: "xlsx" | "csv") => {
    triggerDownload(getProfessorTemplateDownloadUrl(format));
  };

  const handleChooseImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setImportFile(nextFile);
    setImportResult(null);
  };

  const handleDropImportFile = (event: ReactDragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const nextFile = event.dataTransfer.files?.[0] ?? null;
    if (!nextFile) {
      return;
    }
    setImportFile(nextFile);
    setImportResult(null);
  };

  const handleImportSubmit = async () => {
    if (!importFile) {
      notifyWarning("请先选择文件", "请先选择要导入的 csv 或 xlsx 文件");
      return;
    }
    setImportingFile(true);
    try {
      const result = await importProfessorsFromFile(importFile);
      setImportResult(result);
      notifySuccess("导入完成", result.message);
      await loadProfessors();
    } catch (importError) {
      notifyError(
        "导入导师失败",
        getActionErrorMessage(importError, "导入导师失败"),
      );
    } finally {
      setImportingFile(false);
    }
  };

  const closeCrawlerModal = () => {
    if (creatingCrawlJob) {
      return;
    }
    setCrawlerModalOpen(false);
  };

  const handleCreateCrawlJob = async () => {
    const startUrls = normalizeCrawlerStartUrls(crawlerFormState.start_urls);
    const payload = {
      university: crawlerFormState.university.trim(),
      school: crawlerFormState.school.trim(),
      start_url: startUrls[0] ?? "",
      start_urls: startUrls,
      entry_type: crawlerFormState.entry_type,
      llm_profile_id: null,
    };
    const diagnosticData = {
      university: payload.university,
      school: payload.school,
      start_url: payload.start_url,
      start_urls: payload.start_urls,
      entry_type: payload.entry_type,
    };
    safeRecordUserAction({
      eventName: "professors.crawl_job_create_submitted",
      data: diagnosticData,
    });
    setCreatingCrawlJob(true);
    try {
      await createCrawlJob(payload);
      safeRecordUserAction({
        eventName: "professors.crawl_job_create_succeeded",
        data: diagnosticData,
      });
      setCrawlerModalOpen(false);
      setCrawlerFormState(emptyCrawlerJobForm());
      notifySuccess("抓取任务已创建");
    } catch (crawlerError) {
      safeRecordUserAction({
        eventName: "professors.crawl_job_create_failed",
        data: diagnosticData,
        message: getActionErrorMessage(crawlerError, "create crawl job failed"),
        level: "error",
      });
      notifyError(
        "创建抓取任务失败",
        getActionErrorMessage(crawlerError, "创建抓取任务失败"),
      );
    } finally {
      setCreatingCrawlJob(false);
    }
  };

  const crawlerSubmitDisabled =
    creatingCrawlJob ||
    !crawlerFormState.university.trim() ||
    !crawlerFormState.school.trim() ||
    normalizeCrawlerStartUrls(crawlerFormState.start_urls).length === 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <section
        aria-labelledby="professors-workbench-title"
        className="rounded-[32px] border border-stone-200 bg-[linear-gradient(180deg,#fcfbf8,#fffaf2)] p-6 shadow-sm"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h1
                id="professors-workbench-title"
                className="mt-4 text-3xl font-semibold tracking-[0.01em] text-stone-900"
              >
                导师档案工作台
              </h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                用模板导入、手动维护、归档隐藏把导师数据整理干净。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  当前列表
                </div>
                <div className="mt-2 text-2xl font-semibold text-stone-900">
                  {filteredProfessors.length}
                </div>
              </div>
              <div className="rounded-3xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  当前筛选
                </div>
                <div className="mt-2 text-2xl font-semibold text-stone-900">
                  {archiveFilterLabels[archiveFilter]}
                </div>
              </div>
              <div className="rounded-3xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  已选择
                </div>
                <div className="mt-2 text-2xl font-semibold text-stone-900">
                  {selectedIds.size}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-stone-200/80 bg-white/92 p-1.5 shadow-sm">
            {(Object.keys(archiveFilterLabels) as ArchiveFilter[]).map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setArchiveFilter(item);
                    setSelectedIds(new Set());
                  }}
                  className={clsx(
                    "rounded-2xl px-4 py-2 text-sm font-medium transition",
                    archiveFilter === item
                      ? "bg-primary text-white shadow-sm shadow-primary/20"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                  )}
                >
                  {archiveFilterLabels[item]}
                </button>
              ),
            )}
          </div>

          <div className="grid gap-3">
            <div data-testid="professor-search-row" className="min-w-0">
              <label className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-3xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <Search className="h-4 w-4 shrink-0 text-stone-400" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索姓名、邮箱、学校、院系或研究方向"
                  className="w-full min-w-0 bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400"
                />
              </label>
            </div>

            <div
              data-testid="professor-filter-row"
              className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
            >
              <div className="grid min-w-0 flex-1 items-start gap-3 sm:grid-cols-[minmax(11rem,0.65fr)_minmax(15rem,1fr)_auto]">
                <div className="grid gap-2">
                  <div
                    data-testid="professor-title-filter-label"
                    className={filterFieldLabelClassName}
                  >
                    职称 / 导师资格
                  </div>
                  <NativeSelectField
                    ariaLabel="职称筛选"
                    value={titleFilter}
                    onChange={(event) => setTitleFilter(event.target.value)}
                    shellClassName="min-h-[3.1rem] rounded-3xl bg-white shadow-sm"
                  >
                    <option value={ALL_PROFESSOR_FILTER_VALUE}>
                      全部职称 / 导师资格
                    </option>
                    {titleOptions.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </NativeSelectField>
                </div>

                <div className="grid gap-2">
                  <div
                    data-testid="professor-school-filter-label"
                    className={filterFieldLabelClassName}
                  >
                    学校 / 学院
                  </div>
                  <NativeSelectField
                    ariaLabel="学校学院筛选"
                    value={schoolPairFilter}
                    onChange={(event) =>
                      setSchoolPairFilter(event.target.value)
                    }
                    shellClassName="min-h-[3.1rem] rounded-3xl bg-white shadow-sm"
                  >
                    <option value={ALL_PROFESSOR_FILTER_VALUE}>
                      全部学校 / 学院
                    </option>
                    {schoolPairOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelectField>
                </div>

                <div className="grid gap-2">
                  <div
                    data-testid="professor-reset-filter-label"
                    className={filterFieldLabelClassName}
                  >
                    操作
                  </div>
                  <button
                    type="button"
                    onClick={resetAdvancedFilters}
                    disabled={!hasAdvancedFilters}
                    className="ui-select-shell min-h-[3.1rem] w-full justify-center rounded-3xl bg-white font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    重置筛选
                  </button>
                </div>
              </div>

              <div className="grid gap-2 lg:justify-end">
                <div
                  aria-hidden="true"
                  data-testid="professor-toolbar-spacer"
                  className={filterFieldLabelClassName}
                />
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <ToolbarMenu onDownload={handleDownloadTemplate} />
                  <button
                    type="button"
                    onClick={() => {
                      setImportFile(null);
                      setImportResult(null);
                      setImportModalOpen(true);
                    }}
                    className="ui-btn-secondary h-10 rounded-2xl"
                  >
                    <Upload className="h-4 w-4" />
                    导入文件
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      safeRecordUserAction({
                        eventName: "professors.crawler_dialog_opened",
                      });
                      setCrawlerModalOpen(true);
                    }}
                    className="ui-btn-secondary h-10 rounded-2xl"
                  >
                    <Bot className="h-4 w-4" />
                    智能抓取
                  </button>
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="ui-btn-primary h-10 rounded-2xl"
                  >
                    <Plus className="h-4 w-4" />
                    新增导师
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadProfessors()}
                    className="ui-btn-secondary h-10 rounded-2xl"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    刷新
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-100 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-stone-600">
            共 {filteredProfessors.length} 位导师，第 {safeCurrentPage} /{" "}
            {totalPages} 页，每页最多 {PROFESSORS_PER_PAGE} 位
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleToggleSelectCurrentPage}
              disabled={currentPageSelectableIds.length === 0}
              className="ui-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allCurrentPageSelected ? "取消全选当前页" : "全选当前页筛选结果"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedIds.size === 0}
              className="ui-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              清空选择
            </button>
          </div>
        </div>

        <div
          data-testid="professor-table-header"
          className={clsx(
            "hidden gap-4 border-b border-stone-100 px-6 py-4 text-xs font-medium uppercase tracking-[0.16em] text-stone-400 lg:grid",
            managementTableColumns,
          )}
        >
          <div className="flex justify-center text-center">选择</div>
          <div className="flex justify-center text-center">导师</div>
          <div className="flex justify-center text-center">职称</div>
          <div className="flex justify-center text-center">邮箱</div>
          <div className="flex justify-center text-center">学校 / 学院</div>
          <div className="flex justify-center text-center">研究方向</div>
          <div className="flex justify-center text-center">更新时间</div>
          <div className="flex justify-center text-center">操作</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载导师列表...
          </div>
        ) : filteredProfessors.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-stone-100 text-stone-400">
              <Users className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-stone-900">
              暂无导师
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-500">
              可下载模板批量导入，也可手动新增。
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setImportFile(null);
                  setImportResult(null);
                  setImportModalOpen(true);
                }}
                className="ui-btn-secondary"
              >
                <Upload className="h-4 w-4" />
                导入文件
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="ui-btn-primary"
              >
                <Plus className="h-4 w-4" />
                新增导师
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {paginatedProfessors.map((professor) => {
              const selectable = !professor.archived_at;
              const checked = selectedIds.has(professor.id);
              return (
                <ManagementProfessorRow
                  key={professor.id}
                  professor={professor}
                  checked={checked}
                  selectable={selectable}
                  tableColumns={managementTableColumns}
                  onToggleSelection={() => {
                    setSelectedIds((previous) => {
                      const next = new Set(previous);
                      if (next.has(professor.id)) {
                        next.delete(professor.id);
                      } else {
                        next.add(professor.id);
                      }
                      return next;
                    });
                  }}
                  onEdit={() => openEditModal(professor)}
                  onArchive={() => void handleArchiveProfessor(professor)}
                  onRestore={() => void handleRestoreProfessor(professor)}
                />
              );
            })}
          </div>
        )}

        {!loading && filteredProfessors.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-stone-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-stone-500">
              当前页 {paginatedProfessors.length} 位导师，已选中{" "}
              {selectedIds.size} 位
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(safeCurrentPage - 1)}
                disabled={safeCurrentPage <= 1}
                className="ui-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一页
              </button>
              <div className="min-w-28 text-center text-sm text-stone-600">
                第 {safeCurrentPage} / {totalPages} 页
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage(safeCurrentPage + 1)}
                disabled={safeCurrentPage >= totalPages}
                className="ui-btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedIds.size > 0 ? (
        <div className="sticky bottom-4 z-20 mt-6">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-[28px] border border-stone-200 bg-white/95 px-5 py-4 shadow-[0_18px_34px_-24px_rgba(41,37,36,0.36)] backdrop-blur-xl">
            <div>
              <div className="text-sm font-medium text-stone-900">
                已选中 {selectedIds.size} 位导师
              </div>
              <div className="mt-1 text-xs text-stone-500">
                这些导师会被移入回收站，但历史任务和通信不会删除。
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="ui-btn-secondary"
              >
                清空选择
              </button>
              <button
                type="button"
                onClick={() => void handleBulkArchive()}
                className="ui-btn-danger"
              >
                <Archive className="h-4 w-4" />
                批量移入回收站
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ModalShell
        open={upsertModalOpen}
        title={
          editingProfessor ? `编辑导师：${editingProfessor.name}` : "新增导师"
        }
        description="手动维护一位导师的核心信息。保存后会立刻出现在导师管理页，并可在首页参与筛选与建任务。"
        onClose={closeUpsertModal}
      >
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block">
            {renderFieldLabel("姓名", true)}
            <input
              value={formState.name}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：张明远"
            />
          </label>
          <label className="block">
            {renderFieldLabel("邮箱", true)}
            <input
              value={formState.email}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  email: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：faculty@example.edu"
            />
          </label>
          <label className="block">
            {renderFieldLabel("职称")}
            <input
              value={formState.title}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  title: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：Associate Professor"
            />
          </label>
          <label className="block">
            {renderFieldLabel("学校")}
            <input
              value={formState.university}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  university: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：Tsinghua University"
            />
          </label>
          <label className="block">
            {renderFieldLabel("学院")}
            <input
              value={formState.school}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  school: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：School of Computer Science"
            />
          </label>
          <label className="block">
            {renderFieldLabel("院系")}
            <input
              value={formState.department}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  department: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：Department of AI"
            />
          </label>
          <label className="block md:col-span-2">
            {renderFieldLabel("研究方向")}
            <textarea
              value={formState.research_direction}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  research_direction: event.target.value,
                }))
              }
              className="min-h-28 w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="示例：Large Language Models, Information Extraction, NLP"
            />
          </label>
          <label className="block md:col-span-2">
            {renderFieldLabel("近期论文")}
            <textarea
              value={formState.recent_papers_text}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  recent_papers_text: event.target.value,
                }))
              }
              className="min-h-32 w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder={
                "一行一篇，例如：\nScaling Agents with...\nReasoning for Scientific Discovery..."
              }
            />
          </label>
          <label className="block">
            {renderFieldLabel("主页链接")}
            <input
              value={formState.profile_url}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  profile_url: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：https://faculty.example.edu/profile"
            />
          </label>
          <label className="block">
            {renderFieldLabel("来源链接")}
            <input
              value={formState.source_url}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  source_url: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：https://example.edu/faculty-directory"
            />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={closeUpsertModal}
            className="ui-btn-secondary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSaveProfessor()}
            disabled={savingProfessor}
            className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingProfessor ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            保存导师
          </button>
        </div>
      </ModalShell>

      <ModalShell
        open={importModalOpen}
        title="导入导师文件"
        description="下载模板并按列填写。导入时按邮箱覆盖记录，回收站记录会自动恢复。"
        onClose={() => {
          if (importingFile) {
            return;
          }
          setImportModalOpen(false);
        }}
      >
        <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
          <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-stone-900">
              先下载模板
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              支持 csv 和 xlsx。下载后按模板里的说明填写即可。
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleDownloadTemplate("xlsx")}
                className="ui-btn-primary"
              >
                <FileSpreadsheet className="h-4 w-4" />
                下载 XLSX 模板
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate("csv")}
                className="ui-btn-secondary"
              >
                <Download className="h-4 w-4" />
                下载 CSV 模板
              </button>
            </div>
            <ul className="mt-5 space-y-2 text-sm leading-6 text-stone-600">
              <li>模板内已包含字段说明和示例行，下载后可直接照着填写。</li>
              <li>说明行和示例行可以保留，导入时会自动忽略。</li>
              <li>
                <span className="font-mono text-xs">research_direction</span>{" "}
                多个方向用中文分号；分隔。
              </li>
              <li>
                <span className="font-mono text-xs">recent_papers</span>{" "}
                多篇论文用 | 分隔；同邮箱会覆盖更新；最多保留前 8 篇。
              </li>
            </ul>
          </div>

          <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-stone-900">
              上传并导入
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              必填列是 name 和 email。格式错误的行会跳过；同邮箱记录会覆盖更新。
            </p>
            <label
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDropImportFile}
              className="mt-4 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-stone-300 bg-stone-50/70 px-5 text-center transition hover:border-stone-400 hover:bg-white"
            >
              <input
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleChooseImportFile}
              />
              <Upload className="h-6 w-6 text-stone-400" />
              <div className="mt-3 text-sm font-medium text-stone-800">
                {importFile
                  ? importFile.name
                  : "拖拽 csv/xlsx 到这里，或点击选择文件"}
              </div>
              <div className="mt-2 text-xs text-stone-500">
                {importFile
                  ? `已选 ${Math.round(importFile.size / 1024)} KB`
                  : "支持 UTF-8 CSV 和 Excel 文件"}
              </div>
            </label>

            {importResult ? (
              <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                <div className="font-medium">{importResult.message}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white/80 px-3 py-1">
                    新增 {importResult.inserted_count}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1">
                    更新 {importResult.updated_count}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1">
                    失败 {importResult.failed_count}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setImportModalOpen(false);
                  setImportResult(null);
                  setImportFile(null);
                }}
                className="ui-btn-secondary"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={() => void handleImportSubmit()}
                disabled={importingFile}
                className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                开始导入
              </button>
            </div>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={crawlerModalOpen}
        title="创建抓取任务"
        description="填写学校、学院和页面 URL，系统会创建抓取任务，抓取结果进入候选审核。"
        onClose={closeCrawlerModal}
        maxWidthClassName="max-w-2xl"
      >
        <div className="mt-6 grid gap-4">
          <label className="block">
            {renderFieldLabel("学校", true)}
            <input
              aria-label="学校"
              value={crawlerFormState.university}
              onChange={(event) =>
                setCrawlerFormState((previous) => ({
                  ...previous,
                  university: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：示例大学"
            />
          </label>
          <label className="block">
            {renderFieldLabel("学院", true)}
            <input
              aria-label="学院"
              value={crawlerFormState.school}
              onChange={(event) =>
                setCrawlerFormState((previous) => ({
                  ...previous,
                  school: event.target.value,
                }))
              }
              className={inputClassName}
              placeholder="示例：计算机学院"
            />
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-stone-800">
              入口类型
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: "list",
                    label: "列表页",
                    hint: "学院教师列表或师资队伍页面",
                  },
                  {
                    value: "profile",
                    label: "详情页",
                    hint: "单个导师个人主页",
                  },
                ] satisfies Array<{
                  value: CrawlJobEntryTypeDTO;
                  label: string;
                  hint: string;
                }>
              ).map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700 transition hover:border-primary/50"
                >
                  <input
                    type="radio"
                    name="crawler-entry-type"
                    aria-label={option.label}
                    value={option.value}
                    checked={crawlerFormState.entry_type === option.value}
                    onChange={() =>
                      setCrawlerFormState((previous) => ({
                        ...previous,
                        entry_type: option.value,
                      }))
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-stone-900">
                      {option.label}
                    </span>
                    <span className="block text-xs leading-5 text-stone-500">
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              {renderFieldLabel("页面 URL", true)}
              <button
                type="button"
                aria-label="添加页面 URL"
                onClick={() =>
                  setCrawlerFormState((previous) => ({
                    ...previous,
                    start_urls: [...previous.start_urls, ""],
                  }))
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:border-primary/50 hover:text-primary"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {crawlerFormState.start_urls.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  aria-label="页面 URL"
                  value={url}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setCrawlerFormState((previous) => ({
                      ...previous,
                      start_urls: previous.start_urls.map((item, itemIndex) =>
                        itemIndex === index ? nextValue : item,
                      ),
                    }));
                  }}
                  className={inputClassName}
                  placeholder={
                    crawlerFormState.entry_type === "profile"
                      ? "示例：https://example.edu/faculty/zhang"
                      : "示例：https://example.edu/faculty"
                  }
                />
                <button
                  type="button"
                  aria-label="移除页面 URL"
                  onClick={() =>
                    setCrawlerFormState((previous) => ({
                      ...previous,
                      start_urls:
                        previous.start_urls.length > 1
                          ? previous.start_urls.filter((_, itemIndex) => itemIndex !== index)
                          : [""],
                    }))
                  }
                  disabled={crawlerFormState.start_urls.length === 1}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={closeCrawlerModal}
            className="ui-btn-secondary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleCreateCrawlJob()}
            disabled={crawlerSubmitDisabled}
            className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingCrawlJob ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            开始抓取
          </button>
        </div>
      </ModalShell>

      {confirmDialog}
    </main>
  );
};
