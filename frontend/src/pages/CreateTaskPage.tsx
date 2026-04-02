import { Navigate } from 'react-router-dom';
import { CreateTaskClient } from '@/components/organisms/CreateTaskClient';
import { MOCK_MENTORS } from '@/data/mockData';

const SESSION_KEY = 'selected_mentor_ids';

const getSelectedMentorIds = (): string[] => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const CreateTaskPage: React.FC = () => {
  const selectedIds = getSelectedMentorIds();

  if (selectedIds.length === 0) {
    return <Navigate to="/" replace />;
  }

  const mentors = MOCK_MENTORS.filter((m) => selectedIds.includes(m.id));

  return <CreateTaskClient mentors={mentors} />;
};
