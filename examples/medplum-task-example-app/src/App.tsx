import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconGridDots, IconLayoutList, IconListCheck } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Timeline } from './components/Timeline';
import { CreateResourcePage } from './pages/CreateResourcePage';
import { DetailsPage } from './pages/DetailsPage';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { TaskByRoleQueue } from './pages/TaskByRoleQueue';
import { TaskPage } from './pages/TaskPage';
import { Worklist } from './pages/Worklist';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const location = useLocation();
  const profile = useMedplumProfile();
  // const navigate = useNavigate();

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
            { icon: <IconLayoutList />, label: 'Worklist', href: '/Task/worklist' },
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
            <Route path="/Task/worklist" element={<Worklist />} />
            <Route path="/Task/worklist/active" element={<Worklist />} />
            <Route path="/Task/worklist/completed" element={<Worklist />} />
            <Route path="/Task/queue" element={<TaskByRoleQueue />} />
            <Route path="/Task/queue/active" element={<TaskByRoleQueue />} />
            <Route path="/Task/queue/completed" element={<TaskByRoleQueue />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
