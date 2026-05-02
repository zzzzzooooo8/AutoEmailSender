import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderOpen, Loader2, MailPlus, RefreshCcw, Search, Sparkles } from 'lucide-react';
import { NativeSelectField } from '@/components/atoms/NativeSelectField';
import { DashboardProfessorRow } from '@/components/molecules/DashboardProfessorRow';
import { MultiSelectFilter } from '@/components/molecules/MultiSelectFilter';
import { OnboardingChecklistCard } from '@/components/molecules/OnboardingChecklistCard';
import { useNotification } from '@/context/NotificationContext';
import { useSelectionContext } from '@/context/SelectionContext';
import {
  buildDashboardFilterOptions,
  createDefaultDashboardFilters,
  filterDashboardProfessors,
  getActiveDashboardFilterCount,
  type DashboardFilterState,
} from '@/features/home-dashboard/client/filterDashboardProfessors';
import {
  PROFESSOR_DASHBOARD_SORT_OPTIONS,
  sortDashboardProfessors,
  type ProfessorDashboardSortKey,
} from '@/features/home-dashboard/client/sortDashboardProfessors';
import { getOnboardingState } from '@/features/onboarding/client/getOnboardingState';
import {
  getProfessorDashboardStatusLabel,
  PROFESSOR_DASHBOARD_STATUS_OPTIONS,
} from '@/features/professor-status/dashboardStatus';
import {
  formatTokenUsageDescription,
  runWarmupThenConcurrent,
  sumTokenUsage,
  type TokenUsage,
} from '@/features/match-analysis/client/tokenUsage';
import { calculateMatch } from '@/lib/api/emailTasksApi';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { listProfessors } from '@/lib/api/professorsApi';
import { ensureWorkspaceTask } from '@/lib/api/workspacesApi';
import type { ProfessorDashboardItemDTO, ProfessorDashboardStatus } from '@/types';

const SESSION_KEY = 'selected_professor_ids';

const hasMatchEvidence = (professor: ProfessorDashboardItemDTO) =>
  Boolean(professor.research_direction?.trim()) ||
  professor.recent_papers.some((paper) => paper.trim());

export const HomePage = () => {
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { notifyError, notifySuccess, notifyWarning } = useNotification();
  const { selectedIdentityId, selectedLlmProfileId, selectedIdentity, selectedLlmProfile } =
    useSelectionContext();
  const [professors, setProfessors] = useState<ProfessorDashboardItemDTO[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<DashboardFilterState>(createDefaultDashboardFilters);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<ProfessorDashboardSortKey>('latest');
  const [loading, setLoading] = useState(false);
  const [hasLoadedProfessors, setHasLoadedProfessors] = useState(false);
  const [bulkScoring, setBulkScoring] = useState(false);
  const [scoringProfessorIds, setScoringProfessorIds] = useState<Set<number>>(new Set());
  const loadedProfessorsKeyRef = useRef<string | null>(null);
  const activeProfessorsRequestKeyRef = useRef<string | null>(null);
  const latestProfessorsRequestIdRef = useRef(0);
  const professorsRequestKey =
    selectedIdentityId && selectedLlmProfileId
      ? `${selectedIdentityId}:${selectedLlmProfileId}`
      : null;

  const loadProfessors = useCallback(async () => {
    if (!professorsRequestKey || !selectedIdentityId || !selectedLlmProfileId) {
      latestProfessorsRequestIdRef.current += 1;
      activeProfessorsRequestKeyRef.current = null;
      loadedProfessorsKeyRef.current = null;
      setHasLoadedProfessors(false);
      setProfessors([]);
      setSelectedIds(new Set());
      setLoading(false);
      return;
    }
    if (loadedProfessorsKeyRef.current !== professorsRequestKey) {
      setHasLoadedProfessors(false);
    }
    const requestId = latestProfessorsRequestIdRef.current + 1;
    latestProfessorsRequestIdRef.current = requestId;
    activeProfessorsRequestKeyRef.current = professorsRequestKey;
    setLoading(true);
    try {
      const data = await listProfessors({
        identityId: selectedIdentityId,
        llmProfileId: selectedLlmProfileId,
      });
      if (
        latestProfessorsRequestIdRef.current !== requestId ||
        activeProfessorsRequestKeyRef.current !== professorsRequestKey
      ) {
        return;
      }
      const previousLoadedKey = loadedProfessorsKeyRef.current;
      setProfessors(data);
      setSelectedIds((previous) => {
        if (previousLoadedKey !== professorsRequestKey) {
          return new Set();
        }
        const next = new Set<number>();
        data.forEach((item) => {
          if (previous.has(item.id)) {
            next.add(item.id);
          }
        });
        return next;
      });
      loadedProfessorsKeyRef.current = professorsRequestKey;
      setHasLoadedProfessors(true);
    } catch (loadError) {
      if (
        latestProfessorsRequestIdRef.current !== requestId ||
        activeProfessorsRequestKeyRef.current !== professorsRequestKey
      ) {
        return;
      }
      if (loadedProfessorsKeyRef.current !== professorsRequestKey) {
        setProfessors([]);
        setSelectedIds(new Set());
      }
      const message = loadError instanceof Error ? loadError.message : '加载导师列表失败';
      notifyError('加载导师列表失败', message);
    } finally {
      if (
        latestProfessorsRequestIdRef.current === requestId &&
        activeProfessorsRequestKeyRef.current === professorsRequestKey
      ) {
        setLoading(false);
      }
    }
  }, [notifyError, professorsRequestKey, selectedIdentityId, selectedLlmProfileId]);

  useEffect(() => {
    void loadProfessors();
  }, [loadProfessors]);

  const filterOptions = buildDashboardFilterOptions(professors);
  const activeAdvancedFilterCount = getActiveDashboardFilterCount(filters);
  const selectedStatusLabels = filters.statuses.map((item) => getProfessorDashboardStatusLabel(item));

  const updateFilters = (nextFilters: Partial<DashboardFilterState>) => {
    setFilters((previous) => ({ ...previous, ...nextFilters }));
  };

  const toggleStringFilterValue = (
    key: 'universities' | 'schools' | 'departments' | 'titles',
    value: string,
  ) => {
    setFilters((previous) => {
      const currentValues = previous[key];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return { ...previous, [key]: nextValues };
    });
  };

  const toggleStatusFilterValue = (value: ProfessorDashboardStatus) => {
    setFilters((previous) => {
      const nextValues = previous.statuses.includes(value)
        ? previous.statuses.filter((item) => item !== value)
        : [...previous.statuses, value];

      return { ...previous, statuses: nextValues };
    });
  };

  const handleMinMatchScoreChange = (value: string) => {
    if (value === '') {
      updateFilters({ minMatchScore: '' });
      return;
    }

    const score = Number(value);
    if (!Number.isFinite(score)) {
      return;
    }

    updateFilters({ minMatchScore: String(Math.min(100, Math.max(0, score))) });
  };

  const clearAdvancedFilters = () => {
    setFilters((previous) => ({
      ...previous,
      universities: [],
      schools: [],
      departments: [],
      titles: [],
      statuses: [],
      minMatchScore: '',
    }));
  };

  const resetAllFilters = () => {
    setFilters(createDefaultDashboardFilters());
    setSortKey('latest');
  };

  const filteredProfessors = filterDashboardProfessors(professors, filters);
  const visibleProfessors = sortDashboardProfessors(filteredProfessors, sortKey);

  const toggleSelection = (professorId: number) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(professorId)) {
        next.delete(professorId);
      } else {
        next.add(professorId);
      }
      return next;
    });
  };

  const handleCreateTask = async () => {
    if (selectedIds.size === 0) {
      await confirm({
        title: '未选择导师',
        description: '选择本次要联系的导师。',
        confirmLabel: '知道了',
        cancelLabel: null,
      });
      return;
    }
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([...selectedIds]));
    navigate('/create-task');
  };

  const hasPrimaryMaterial = Boolean(selectedIdentity?.current_primary_material_id);
  const hasTemplate = Boolean(
    selectedIdentity?.outreach_template_body_text?.trim() || selectedIdentity?.outreach_template_body_html?.trim(),
  );
  const hasMaterialsAndTemplate = hasPrimaryMaterial && hasTemplate;
  const onboardingState = getOnboardingState({
    hasIdentity: Boolean(selectedIdentity),
    hasLlmProfile: Boolean(selectedLlmProfile),
    hasPrimaryMaterial: hasMaterialsAndTemplate,
    hasProfessors: professors.length > 0,
    hasFirstTask: false,
  });
  const shouldSkipHomeOnboardingForCurrentStage =
    onboardingState.completed || onboardingState.stage === 'first_task';
  const canEvaluateProfessorOnboarding = professorsRequestKey === null || hasLoadedProfessors;

  const toggleScoringProfessor = (professorId: number, active: boolean) => {
    setScoringProfessorIds((previous) => {
      const next = new Set(previous);
      if (active) {
        next.add(professorId);
      } else {
        next.delete(professorId);
      }
      return next;
    });
  };

  const runCalculateMatchForProfessor = useCallback(
    async (professorId: number): Promise<TokenUsage> => {
      if (!selectedIdentityId || !selectedLlmProfileId) {
        throw new Error('请先选择身份和模型');
      }

      const workspace = await ensureWorkspaceTask(professorId, selectedIdentityId, selectedLlmProfileId);
      if (!workspace.current_task.id) {
        throw new Error('未能为该导师准备工作区任务');
      }
      const result = await calculateMatch(workspace.current_task.id);
      return result.usage;
    },
    [selectedIdentityId, selectedLlmProfileId],
  );

  const handleGenerateOne = async (professorId: number) => {
    if (!hasPrimaryMaterial) {
      notifyWarning(
        '缺少默认材料',
        '请到个人中心设置默认材料。',
      );
      return;
    }

    const professor = professors.find((item) => item.id === professorId);
    if (professor && !hasMatchEvidence(professor)) {
      notifyWarning(
        '缺少研究信息',
        '请先补充该导师的研究方向或近期论文，再分析匹配度。',
      );
      return;
    }

    toggleScoringProfessor(professorId, true);
    try {
      const usage = await runCalculateMatchForProfessor(professorId);
      await loadProfessors();
      notifySuccess('匹配分析完成', formatTokenUsageDescription(usage));
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '计算匹配失败';
      notifyError('计算匹配失败', message);
    } finally {
      toggleScoringProfessor(professorId, false);
    }
  };

  const handleGenerateSelected = async () => {
    if (selectedIds.size === 0) {
      await confirm({
        title: '未选择导师',
        description: '选择要批量计算匹配的导师。',
        confirmLabel: '知道了',
        cancelLabel: null,
      });
      return;
    }

    if (!hasPrimaryMaterial) {
      notifyWarning(
        '缺少默认材料',
        '请到个人中心设置默认材料。',
      );
      return;
    }

    setBulkScoring(true);
    const failedNames: string[] = [];
    const selectedProfessors = professors.filter((item) => selectedIds.has(item.id));
    const analyzableProfessors = selectedProfessors.filter(hasMatchEvidence);
    const skippedCount = selectedProfessors.length - analyzableProfessors.length;

    if (analyzableProfessors.length === 0) {
      notifyWarning(
        '缺少研究信息',
        '已选导师都缺少研究方向或近期论文，暂不能分析匹配度。',
      );
      setBulkScoring(false);
      return;
    }

    try {
      const usageResults = await runWarmupThenConcurrent(
        analyzableProfessors,
        3,
        async (professor): Promise<TokenUsage | null> => {
          toggleScoringProfessor(professor.id, true);
          try {
            return await runCalculateMatchForProfessor(professor.id);
          } catch (actionError) {
            failedNames.push(
              actionError instanceof Error
                ? `${professor.name}：${actionError.message}`
                : `${professor.name}：计算匹配失败`,
            );
            return null;
          } finally {
            toggleScoringProfessor(professor.id, false);
          }
        },
      );
      await loadProfessors();
      const successfulUsages = usageResults.filter((usage): usage is TokenUsage => usage !== null);
      const summary = `成功 ${successfulUsages.length} 位 / 失败 ${failedNames.length} 位 / 跳过 ${skippedCount} 位；${formatTokenUsageDescription(sumTokenUsage(successfulUsages))}`;
      if (failedNames.length > 0) {
        notifyError('部分导师计算失败', `${summary}；${failedNames.slice(0, 2).join('；')}`);
      } else {
        notifySuccess('批量匹配分析完成', summary);
      }
    } finally {
      setBulkScoring(false);
    }
  };

  if (canEvaluateProfessorOnboarding && !shouldSkipHomeOnboardingForCurrentStage) {
    return (
      <>
        <main className="mx-auto max-w-6xl px-6 py-8">
          <OnboardingChecklistCard
            title="完成首次配置"
            description={onboardingState.description}
            nextActionHref={onboardingState.nextActionHref}
            nextActionLabel="继续配置"
            items={[
              { label: '创建发件身份', done: Boolean(selectedIdentity) },
              { label: '配置 AI 模型', done: Boolean(selectedLlmProfile) },
              { label: '准备材料和模板', done: hasMaterialsAndTemplate },
              { label: '导入导师', done: professors.length > 0 },
            ]}
          />
        </main>
        {confirmDialog}
      </>
    );
  }

  if (!selectedIdentityId || !selectedLlmProfileId || !selectedIdentity || !selectedLlmProfile) {
    return null;
  }

  return (
    <>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="rounded-3xl border border-stone-200 bg-[#fcfbf8] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-stone-900">导师看板</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
                  身份：{selectedIdentity.name}
                </span>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
                  模型：{selectedLlmProfile.name}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => void loadProfessors()} className="ui-btn-secondary">
                <RefreshCcw className="h-4 w-4" />
                刷新列表
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateSelected()}
                disabled={bulkScoring || selectedIds.size === 0}
                className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkScoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                批量分析匹配度
              </button>
              <Link to="/professors" data-interactive="button" className="ui-btn-secondary">
                <FolderOpen className="h-4 w-4" />
                管理导师
              </Link>
              <button type="button" onClick={() => void handleCreateTask()} className="ui-btn-primary">
                <MailPlus className="h-4 w-4" />
                创建批量任务
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)_auto_auto] lg:items-stretch">
            <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-600 shadow-sm">
              <div className="shrink-0 font-medium leading-5 text-stone-800">关键词</div>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Search className="h-4 w-4 text-stone-400" />
                <input
                  value={filters.keyword}
                  onChange={(event) => updateFilters({ keyword: event.target.value })}
                  placeholder="导师、学校、学院、系所、职称、研究方向"
                  className="w-full bg-transparent leading-5 outline-none"
                />
              </div>
            </label>

            <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-600 shadow-sm">
              <div className="shrink-0 font-medium leading-5 text-stone-800">排序</div>
              <NativeSelectField
                ariaLabel="排序"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as ProfessorDashboardSortKey)}
                wrapperClassName="min-w-0 flex-1"
                shellClassName="!min-h-0 h-8 border-0 bg-stone-50 px-3 py-0 shadow-none"
              >
                {PROFESSOR_DASHBOARD_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelectField>
            </div>

            <button
              type="button"
              onClick={() => setAdvancedFiltersOpen((previous) => !previous)}
              className="ui-btn-secondary h-full justify-center whitespace-nowrap"
            >
              高级筛选{activeAdvancedFilterCount > 0 ? ` ${activeAdvancedFilterCount}` : ''}
            </button>

            <button
              type="button"
              onClick={resetAllFilters}
              className="ui-btn-secondary h-full justify-center whitespace-nowrap"
            >
              重置
            </button>
          </div>

          {advancedFiltersOpen ? (
            <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-stone-800">高级筛选</div>
                <button type="button" onClick={clearAdvancedFilters} className="ui-btn-secondary px-3 py-1.5 text-sm">
                  清空高级筛选
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <MultiSelectFilter
                  label="学校"
                  allLabel="全部学校"
                  selectedValues={filters.universities}
                  options={filterOptions.universities}
                  onToggle={(value) => toggleStringFilterValue('universities', value)}
                  onClear={() => updateFilters({ universities: [] })}
                />
                <MultiSelectFilter
                  label="学院"
                  allLabel="全部学院"
                  selectedValues={filters.schools}
                  options={filterOptions.schools}
                  onToggle={(value) => toggleStringFilterValue('schools', value)}
                  onClear={() => updateFilters({ schools: [] })}
                />
                <MultiSelectFilter
                  label="系所"
                  allLabel="全部系所"
                  selectedValues={filters.departments}
                  options={filterOptions.departments}
                  onToggle={(value) => toggleStringFilterValue('departments', value)}
                  onClear={() => updateFilters({ departments: [] })}
                />
                <MultiSelectFilter
                  label="职称"
                  allLabel="全部职称"
                  selectedValues={filters.titles}
                  options={filterOptions.titles}
                  onToggle={(value) => toggleStringFilterValue('titles', value)}
                  onClear={() => updateFilters({ titles: [] })}
                />
                <MultiSelectFilter
                  label="状态"
                  allLabel="全部状态"
                  selectedValues={selectedStatusLabels}
                  options={PROFESSOR_DASHBOARD_STATUS_OPTIONS.map(([, label]) => label)}
                  onToggle={(label) => {
                    const option = PROFESSOR_DASHBOARD_STATUS_OPTIONS.find(
                      ([, optionLabel]) => optionLabel === label,
                    );
                    if (option) {
                      toggleStatusFilterValue(option[0]);
                    }
                  }}
                  onClear={() => updateFilters({ statuses: [] })}
                />
                <label className="block">
                  <div className="mb-2 text-sm font-medium text-stone-800">最低匹配度</div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={filters.minMatchScore}
                    onChange={(event) => handleMinMatchScoreChange(event.target.value)}
                    placeholder="例如 80"
                    className="ui-select-shell w-full"
                  />
                </label>
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {!hasPrimaryMaterial ? (
              <p className="text-sm text-amber-700">
                未设置默认材料，暂不能计算匹配；仍可进入工作区手动写信。
              </p>
            ) : (
              <p className="text-sm text-stone-500">
                根据默认材料与导师研究方向/近期论文分析匹配度；草稿请在工作区生成。
              </p>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
            <div className="text-sm text-stone-600">
              共 {visibleProfessors.length} 位导师，已选择 {selectedIds.size} 位
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(visibleProfessors.map((item) => item.id)))}
                className="ui-btn-secondary px-3 py-1.5 text-sm"
              >
                全选当前结果
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="ui-btn-secondary px-3 py-1.5 text-sm"
              >
                清空选择
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载导师列表...
            </div>
          ) : visibleProfessors.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-stone-500">
              <div>暂无可用导师。可在导师管理页导入或新增。</div>
              <Link to="/professors" data-interactive="button" className="ui-btn-primary mt-5">
                去导师管理
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {visibleProfessors.map((professor) => (
                <DashboardProfessorRow
                  key={professor.id}
                  professor={professor}
                  selected={selectedIds.has(professor.id)}
                  bulkDisabled={bulkScoring}
                  scoring={scoringProfessorIds.has(professor.id)}
                  canCalculateMatch={hasMatchEvidence(professor)}
                  statusLabel={getProfessorDashboardStatusLabel(professor.status)}
                  onToggleSelection={() => toggleSelection(professor.id)}
                  onCalculateMatch={() => void handleGenerateOne(professor.id)}
                  onOpenWorkspace={() => navigate(`/workspace/${professor.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      {confirmDialog}
    </>
  );
};
