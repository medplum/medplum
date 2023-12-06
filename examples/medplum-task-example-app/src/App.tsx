import {
  AppShell,
  DefaultResourceTimeline,
  ErrorBoundary,
  Loading,
  Logo,
  useMedplum,
  useMedplumProfile,
} from '@medplum/react';
import { IconUser } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { NotesPage } from './pages/NotesPage';
import { PatientHistory } from './components/PatientHistory';
import { PatientOverview } from './components/PatientOverview';
import { Timeline } from './components/Timeline';
import { CreateResourcePage } from './pages/CreateResourcePage';
import { DetailsPage } from './pages/DetailsPage';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { TaskPage } from './pages/TaskPage';

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
            { icon: <IconUser />, label: 'Worklist', href: '/Worklist' },
            { icon: <IconUser />, label: 'Tasks For My Role', href: '/Queue' },
            { icon: <IconUser />, label: 'All Tasks', href: '/Task' },
          ],
        },
      ]}
    >
      <ErrorBoundary key={location.key}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={profile ? <HomePage /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/Patient/:id" element={<PatientPage />}>
              <Route index element={<PatientOverview />} />
              <Route path="overview" element={<PatientOverview />} />
              <Route path="timeline" element={<Timeline />} />
              <Route path="history" element={<PatientHistory />} />
            </Route>
            <Route path="/:resourceType" element={<SearchPage />} />
            <Route path="/:resourceType/:id" element={<ResourcePage />} />
            <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
            <Route path="/:resourceType/new" element={<CreateResourcePage />} />
            <Route path="/Task/:id" element={<TaskPage />}>
              <Route index element={<TaskPage />} />
              <Route path="details" element={<DetailsPage />} />
              <Route path="timeline" element={<Timeline />} />
              <Route path="notes" element={<TaskPage />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
