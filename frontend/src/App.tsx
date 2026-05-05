import { useEffect } from 'react';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { RouteScrollRestoration } from '@/components/organisms/RouteScrollRestoration';
import { TopNavBar } from '@/components/organisms/TopNavBar';
import { NotificationProvider } from '@/context/NotificationContext';
import { SelectionProvider } from '@/context/SelectionContext';
import { recordDiagnosticEvent } from '@/lib/diagnostics';
import { updateDesktopBackendBaseUrl } from '@/lib/api/client';
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

  useEffect(() => {
    const unsubscribe = window.autoEmailSender?.onBackendStatus?.((status) => {
      if (status.state === 'ready') {
        updateDesktopBackendBaseUrl(status.baseUrl);
      }

      try {
        recordDiagnosticEvent({
          level: status.state === 'error' ? 'error' : 'info',
          category: 'system',
          eventName: `desktop.backend_${status.state}`,
          data: status,
        });
      } catch {
        // Diagnostics should never affect app startup.
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    <Router>
      <RouteScrollRestoration />
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
    </Router>
  );
}

export default App;
