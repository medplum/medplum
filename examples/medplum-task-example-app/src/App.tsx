import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconGridDots, IconLayoutList, IconListCheck } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Timeline } from './components/Timeline';
import { AllTasks } from './pages/AllTasks';
import { CreateResourcePage } from './pages/CreateResourcePage';
import { DetailsPage } from './pages/DetailsPage';
import { LandingPage } from './pages/LandingPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { TaskByRoleQueue } from './pages/TaskByRoleQueue';
import { TaskPage } from './pages/TaskPage';
import { MyTasks } from './pages/MyTasks';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const location = useLocation();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          title: 'My Links',
          links: [
            { icon: <IconLayoutList />, label: 'My Tasks', href: '/Task/mytasks' },
            { icon: <IconListCheck />, label: 'Tasks For My Role', href: '/Task/queue' },
            { icon: <IconGridDots />, label: 'All Tasks', href: '/Task' },
          ],
        },
      ]}
    >
      <ErrorBoundary key={location.key}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={profile ? <SearchPage /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/:resourceType" element={<SearchPage />} />
            <Route path="/:resourceType/new" element={<CreateResourcePage />} />
            <Route path="/:resourceType/:id" element={<ResourcePage />} />
            <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
            <Route path="/Task/new" element={<CreateResourcePage />} />
            <Route path="/Task/:id" element={<TaskPage />}>
              <Route index element={<TaskPage />} />
              <Route path="details" element={<DetailsPage />} />
              <Route path="timeline" element={<Timeline />} />
              <Route path="notes" element={<TaskPage />} />
            </Route>
            <Route path="/Task" element={<AllTasks />} />
            <Route path="/Task/mytasks" element={<MyTasks />} />
            <Route path="/Task/mytasks/active" element={<MyTasks />} />
            <Route path="/Task/mytasks/completed" element={<MyTasks />} />
            <Route path="/Task/queue" element={<TaskByRoleQueue />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
