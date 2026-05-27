import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { DesktopStartupStatusBanner } from '@/components/organisms/DesktopStartupStatusBanner';
import { RouteScrollRestoration } from '@/components/organisms/RouteScrollRestoration';
import { TopNavBar } from '@/components/organisms/TopNavBar';
import { DesktopBackendProvider } from '@/context/DesktopBackendContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { SelectionProvider } from '@/context/SelectionContext';

const CreateTaskPage = lazy(() =>
  import('@/pages/CreateTaskPage').then((module) => ({ default: module.CreateTaskPage })),
);
const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })));
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);
const ProfessorsPage = lazy(() =>
  import('@/pages/ProfessorsPage').then((module) => ({ default: module.ProfessorsPage })),
);
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const TasksPage = lazy(() => import('@/pages/TasksPage').then((module) => ({ default: module.TasksPage })));
const TestComposePage = lazy(() =>
  import('@/pages/TestComposePage').then((module) => ({ default: module.TestComposePage })),
);
const WorkspacePage = lazy(() =>
  import('@/pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })),
);

const routeLoadingFallback = (
  <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
    页面加载中…
  </div>
);

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
                <Suspense fallback={routeLoadingFallback}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/professors" element={<ProfessorsPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/create-task" element={<CreateTaskPage />} />
                    <Route path="/test-compose" element={<TestComposePage />} />
                    <Route path="/workspace/:id" element={<WorkspacePage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/404" element={<NotFoundPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </div>
            </div>
          </SelectionProvider>
        </DesktopBackendProvider>
      </NotificationProvider>
    </Router>
  );
}

export default App;
