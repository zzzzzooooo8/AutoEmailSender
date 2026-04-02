import { TasksDashboardClient } from '@/components/organisms/TasksDashboardClient';
import { MOCK_TASKS } from '@/data/mockData';

export const TasksPage = () => {
  return <TasksDashboardClient initialTasks={MOCK_TASKS} />;
};
