import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionToolBar } from '../molecules/ActionToolBar';
import { MentorListContainer } from './MentorListContainer';
import type { Mentor } from '@/types';
import { useMentorFilters } from '@/features/mentor-filter/client/useMentorFilters';
import { ALL_FILTER_VALUE } from '@/features/mentor-filter/types';
import type { MentorStatus } from '@/types';

interface MentorDashboardClientProps {
  initialMentors: Mentor[];
}

const STATUS_OPTIONS: { label: string; value: MentorStatus | typeof ALL_FILTER_VALUE }[] = [
  { label: '全部', value: ALL_FILTER_VALUE },
  { label: '未发送', value: '未发送' },
  { label: '已读', value: '已读' },
  { label: '待审核', value: '待审核' },
  { label: '已回复', value: '已回复' },
  { label: '婉拒', value: '婉拒' },
];

const SESSION_KEY = 'selected_mentor_ids';

export const MentorDashboardClient: React.FC<MentorDashboardClientProps> = ({ initialMentors }) => {
  const navigate = useNavigate();
  const {
    filters,
    filteredMentors,
    options,
    setKeyword,
    toggleUniversitySchoolPair,
    setTitle,
    setMatchScoreRange,
    setStatus,
    resetSchoolAndCollege,
    activeSchoolAndCollegeCount,
  } = useMentorFilters(initialMentors);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleMentor = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredMentors.map((m) => m.id)));
  };

  const inverseSelect = () => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      filteredMentors.forEach((m) => {
        if (!prev.has(m.id)) next.add(m.id);
      });
      return next;
    });
  };

  const handleWriteEmail = (id: string) => {
    navigate(`/workspace/${id}`);
  };

  const handleCreateTask = () => {
    if (selectedIds.size === 0) {
      window.alert('请先在列表中勾选要发送的导师');
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...selectedIds]));
    navigate('/create-task');
  };

  return (
    <>
      <ActionToolBar
        toolbarTitle={`导师库（${filteredMentors.length}）`}
        searchQuery={filters.keyword}
        onSearchChange={setKeyword}
        selectedPairs={filters.universitySchoolPairs}
        allPairs={options.universitySchoolOptions}
        activeFilterCount={activeSchoolAndCollegeCount}
        title={filters.title}
        titleOptions={options.titleOptions}
        matchScoreRange={filters.matchScoreRange}
        status={filters.status}
        statusOptions={STATUS_OPTIONS}
        onTogglePair={toggleUniversitySchoolPair}
        onTitleChange={setTitle}
        onMatchScoreRangeChange={setMatchScoreRange}
        onStatusChange={setStatus}
        onResetSchoolAndCollege={resetSchoolAndCollege}
        onImportClick={() => window.alert('导入导师（待开发）')}
        onScrapeClick={() => window.alert('智能抓取（待开发）')}
        onCreateTaskClick={handleCreateTask}
      />

      <div className="mt-6">
        <MentorListContainer
          mentors={filteredMentors}
          selectedIds={selectedIds}
          onToggle={toggleMentor}
          onSelectAll={selectAll}
          onInverseSelect={inverseSelect}
          onWriteEmail={handleWriteEmail}
        />
      </div>
    </>
  );
};
