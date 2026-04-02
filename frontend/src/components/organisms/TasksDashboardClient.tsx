import { useState } from 'react';
import { Plus } from 'lucide-react';
import { BatchTaskCard, type BatchTask } from '../molecules/BatchTaskCard';
import { PrimaryFillButton } from '../atoms/PrimaryFillButton';

interface TasksDashboardClientProps {
  initialTasks: BatchTask[];
}

export const TasksDashboardClient: React.FC<TasksDashboardClientProps> = ({ initialTasks }) => {
  const [tasks, setTasks] = useState<BatchTask[]>(initialTasks);

  const handlePause = (id: string) => setTasks(tasks.map((t) => (t.id === id ? { ...t, status: '已暂停' } : t)));
  const handleResume = (id: string) => setTasks(tasks.map((t) => (t.id === id ? { ...t, status: '运行中' } : t)));
  const handleStop = (id: string) => {
    if (window.confirm('确定要中止该任务吗？中止后不可恢复。')) {
      setTasks(tasks.map((t) => (t.id === id ? { ...t, status: '已完成' } : t)));
    }
  };

  const handleView = (id: string) => window.alert(`查看任务 ${id} 详情（待开发）`);
  const handleCreateTask = () => window.alert('新建批量任务（待开发）');

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-stone-800 tracking-wide mb-1">发送任务大厅</h1>
            <p className="text-stone-500 font-medium">管理自动化套磁任务进度与调度策略</p>
          </div>

          <PrimaryFillButton
            label="新建批量任务"
            icon={<Plus className="w-5 h-5" />}
            onClick={handleCreateTask}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tasks.map((task) => (
            <BatchTaskCard
              key={task.id}
              task={task}
              onPause={handlePause}
              onResume={handleResume}
              onStop={handleStop}
              onView={handleView}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
