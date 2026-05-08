import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { DesktopStartupStatusBanner } from '@/components/organisms/DesktopStartupStatusBanner';
import { RouteScrollRestoration } from '@/components/organisms/RouteScrollRestoration';
import { TopNavBar } from '@/components/organisms/TopNavBar';
import { DesktopBackendProvider } from '@/context/DesktopBackendContext';
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
  const Router = window.autoEmailSender ? HashRouter : BrowserRouter;

  return (
    <Router>
      <RouteScrollRestoration />
      <NotificationProvider>
        <DesktopBackendProvider>
          <SelectionProvider>
            <div className="flex min-h-screen flex-col bg-background">
              <DesktopStartupStatusBanner />
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
        </DesktopBackendProvider>
      </NotificationProvider>
    </Router>
  );
}

export default App;
