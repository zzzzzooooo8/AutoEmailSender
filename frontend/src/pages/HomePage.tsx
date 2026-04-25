import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderOpen, Loader2, MailPlus, RefreshCcw, Search, Sparkles } from 'lucide-react';
import { NativeSelectField } from '@/components/atoms/NativeSelectField';
import { OnboardingChecklistCard } from '@/components/molecules/OnboardingChecklistCard';
import { useNotification } from '@/context/NotificationContext';
import { useSelectionContext } from '@/context/SelectionContext';
import { getOnboardingState } from '@/features/onboarding/client/getOnboardingState';
import {
  filterProfessorsByDashboardStatus,
  getProfessorDashboardStatusLabel,
  PROFESSOR_DASHBOARD_STATUS_OPTIONS,
  type ProfessorDashboardStatusFilter,
} from '@/features/professor-status/dashboardStatus';
import { calculateMatch } from '@/lib/api/emailTasksApi';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { listProfessors } from '@/lib/api/professorsApi';
import { ensureWorkspaceTask } from '@/lib/api/workspacesApi';
import type { ProfessorDashboardItemDTO } from '@/types';

const SESSION_KEY = 'selected_professor_ids';

export const HomePage = () => {
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { notifyError, notifyWarning } = useNotification();
  const { selectedIdentityId, selectedLlmProfileId, selectedIdentity, selectedLlmProfile } =
    useSelectionContext();
  const [professors, setProfessors] = useState<ProfessorDashboardItemDTO[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [university, setUniversity] = useState('all');
  const [status, setStatus] = useState<ProfessorDashboardStatusFilter>('all');
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

  const filteredProfessors = filterProfessorsByDashboardStatus(professors, status).filter((item) => {
    const query = keyword.trim().toLowerCase();
    const keywordMatched =
      !query ||
      [item.name, item.university, item.school, item.research_direction]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query));
    const universityMatched = university === 'all' || item.university === university;
    return keywordMatched && universityMatched;
  });

  const universityOptions = Array.from(
    new Set(professors.map((item) => item.university).filter(Boolean)),
  ) as string[];

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
    async (professorId: number) => {
      if (!selectedIdentityId || !selectedLlmProfileId) {
        throw new Error('请先选择身份和模型');
      }

      const workspace = await ensureWorkspaceTask(professorId, selectedIdentityId, selectedLlmProfileId);
      if (!workspace.current_task.id) {
        throw new Error('未能为该导师准备工作区任务');
      }
      await calculateMatch(workspace.current_task.id);
    },
    [selectedIdentityId, selectedLlmProfileId],
  );

  const handleGenerateOne = async (professorId: number) => {
    if (!hasPrimaryMaterial) {
      notifyWarning(
        '缺少默认材料',
        '请到个人页设置默认材料。',
      );
      return;
    }

    toggleScoringProfessor(professorId, true);
    try {
      await runCalculateMatchForProfessor(professorId);
      await loadProfessors();
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
        '请到个人页设置默认材料。',
      );
      return;
    }

    setBulkScoring(true);
    const failedNames: string[] = [];
    const selectedProfessors = professors.filter((item) => selectedIds.has(item.id));

    try {
      for (const professor of selectedProfessors) {
        toggleScoringProfessor(professor.id, true);
        try {
          await runCalculateMatchForProfessor(professor.id);
        } catch (actionError) {
          failedNames.push(
            actionError instanceof Error
              ? `${professor.name}：${actionError.message}`
              : `${professor.name}：计算匹配失败`,
          );
        } finally {
          toggleScoringProfessor(professor.id, false);
        }
      }
      await loadProfessors();
      if (failedNames.length > 0) {
        notifyError('部分导师计算失败', failedNames.slice(0, 2).join('；'));
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
                批量只算匹配
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

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <label className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 shadow-sm">
              <div className="mb-2 font-medium text-stone-800">关键词</div>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-stone-400" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="导师、学校、研究方向"
                  className="w-full bg-transparent outline-none"
                />
              </div>
            </label>

            <NativeSelectField
              label="学校"
              value={university}
              onChange={(event) => setUniversity(event.target.value)}
              wrapperClassName="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 shadow-sm"
              shellClassName="border-0 bg-transparent px-0 py-0 shadow-none"
            >
              <option value="all">全部学校</option>
              {universityOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </NativeSelectField>

            <NativeSelectField
              label="状态"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              wrapperClassName="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 shadow-sm"
              shellClassName="border-0 bg-transparent px-0 py-0 shadow-none"
            >
              <option value="all">全部状态</option>
              {PROFESSOR_DASHBOARD_STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelectField>
          </div>

          <div className="mt-4 space-y-2">
            {!hasPrimaryMaterial ? (
              <p className="text-sm text-amber-700">
                未设置默认材料，暂不能计算匹配；仍可进入工作区手动写信。
              </p>
            ) : (
              <p className="text-sm text-stone-500">
                首页只计算匹配；草稿请在工作区生成。
              </p>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
            <div className="text-sm text-stone-600">
              共 {filteredProfessors.length} 位导师，已选择 {selectedIds.size} 位
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(filteredProfessors.map((item) => item.id)))}
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
          ) : filteredProfessors.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-stone-500">
              <div>暂无可用导师。可在导师管理页导入或新增。</div>
              <Link to="/professors" data-interactive="button" className="ui-btn-primary mt-5">
                去导师管理
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {filteredProfessors.map((professor) => (
                <div key={professor.id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start">
                  <div className="flex items-start gap-4 md:w-[52%]">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(professor.id)}
                      onChange={() => toggleSelection(professor.id)}
                      className="mt-1 h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary"
                    />
                    <div>
                      <div className="text-lg font-medium text-stone-900">{professor.name}</div>
                      <div className="mt-1 text-sm text-stone-500">
                        {[professor.title, professor.university, professor.school].filter(Boolean).join(' / ')}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {professor.research_direction || '暂无研究方向描述'}
                      </p>
                    </div>
                  </div>

                  <div className="grid flex-1 gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm">
                      <div className="text-stone-500">匹配分数</div>
                      <div className="mt-2 text-lg font-semibold text-stone-900">
                        {professor.match_score === null ? '未计算' : `${professor.match_score}%`}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm">
                      <div className="text-stone-500">发送次数</div>
                      <div className="mt-2 text-lg font-semibold text-stone-900">{professor.sent_count}</div>
                    </div>
                    <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm">
                      <div className="text-stone-500">当前状态</div>
                      <div className="mt-2 text-lg font-semibold text-stone-900">
                        {getProfessorDashboardStatusLabel(professor.status)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 md:justify-end">
                    <button
                      type="button"
                      onClick={() => void handleGenerateOne(professor.id)}
                      disabled={bulkScoring || scoringProfessorIds.has(professor.id)}
                      className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {scoringProfessorIds.has(professor.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      只算匹配
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/workspace/${professor.id}`)}
                      disabled={bulkScoring}
                      className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      打开工作区
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      {confirmDialog}
    </>
  );
};
