import { UserPlus, Bot, Plus } from 'lucide-react';
import { SearchInput } from '../atoms/SearchInput';
import { PrimaryFillButton } from '../atoms/PrimaryFillButton';
import { SchoolAndCollegeFilter } from './SchoolAndCollegeFilter';
import { type MentorStatusFilter, type UniversitySchoolPair } from '@/features/mentor-filter/types';

interface ActionToolBarProps {
  toolbarTitle: string;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  selectedPairs: UniversitySchoolPair[];
  allPairs: UniversitySchoolPair[];
  activeFilterCount: number;
  title: string;
  titleOptions: string[];
  matchScoreRange: string;
  status: MentorStatusFilter;
  statusOptions: { label: string; value: MentorStatusFilter }[];
  onTogglePair: (pair: UniversitySchoolPair) => void;
  onTitleChange: (title: string) => void;
  onMatchScoreRangeChange: (range: string) => void;
  onStatusChange: (status: MentorStatusFilter) => void;
  onResetSchoolAndCollege: () => void;
  onImportClick: () => void;
  onScrapeClick: () => void;
  onCreateTaskClick: () => void;
}

export const ActionToolBar: React.FC<ActionToolBarProps> = ({
  toolbarTitle,
  searchQuery,
  onSearchChange,
  selectedPairs,
  allPairs,
  activeFilterCount,
  title,
  titleOptions,
  matchScoreRange,
  status,
  statusOptions,
  onTogglePair,
  onTitleChange,
  onMatchScoreRangeChange,
  onStatusChange,
  onResetSchoolAndCollege,
  onImportClick,
  onScrapeClick,
  onCreateTaskClick,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold text-stone-800">{toolbarTitle}</h1>
        <SearchInput value={searchQuery} onChange={onSearchChange} />
        <SchoolAndCollegeFilter
          selectedPairs={selectedPairs}
          allPairs={allPairs}
          activeFilterCount={activeFilterCount}
          title={title}
          titleOptions={titleOptions}
          matchScoreRange={matchScoreRange}
          status={status}
          statusOptions={statusOptions}
          onTogglePair={onTogglePair}
          onTitleChange={onTitleChange}
          onMatchScoreRangeChange={onMatchScoreRangeChange}
          onStatusChange={onStatusChange}
          onReset={onResetSchoolAndCollege}
        />
      </div>

      <div className="flex items-center gap-4">
        <PrimaryFillButton label="新建批量任务" icon={<Plus className="w-5 h-5" />} onClick={onCreateTaskClick} />
        <PrimaryFillButton label="导入导师" icon={<UserPlus className="w-4 h-4" />} onClick={onImportClick} />
        <PrimaryFillButton label="智能抓取" icon={<Bot className="w-4 h-4" />} onClick={onScrapeClick} />
      </div>
    </div>
  );
};
