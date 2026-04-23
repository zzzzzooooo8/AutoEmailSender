import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { TopNavBar } from '@/components/organisms/TopNavBar';
import { NotificationProvider } from '@/context/NotificationContext';
import { SelectionProvider } from '@/context/SelectionContext';
import { CreateTaskPage } from '@/pages/CreateTaskPage';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProfessorsPage } from '@/pages/ProfessorsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { TasksPage } from '@/pages/TasksPage';
import { TestComposePage } from '@/pages/TestComposePage';
import { WorkspacePage } from '@/pages/WorkspacePage';

function App() {
  return (
    <BrowserRouter>
      <NotificationProvider>
        <SelectionProvider>
          <div className="flex min-h-screen flex-col bg-background">
            <TopNavBar />
            <div className="min-h-0 flex-1">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/professors" element={<ProfessorsPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/create-task" element={<CreateTaskPage />} />
                <Route path="/test-compose" element={<TestComposePage />} />
                <Route path="/workspace/:id" element={<WorkspacePage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/404" element={<NotFoundPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </div>
          </div>
        </SelectionProvider>
      </NotificationProvider>
    </BrowserRouter>
  );
}

export default App;
