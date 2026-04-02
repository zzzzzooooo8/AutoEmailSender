import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { TopNavBar } from '@/components/organisms/TopNavBar';
import { HomePage } from '@/pages/HomePage';
import { TasksPage } from '@/pages/TasksPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { ProfilePage } from '@/pages/ProfilePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { CreateTaskPage } from '@/pages/CreateTaskPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background flex flex-col">
        <TopNavBar />
        <div className="flex-1 flex flex-col">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/create-task" element={<CreateTaskPage />} />
            <Route path="/workspace/:id" element={<WorkspacePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
