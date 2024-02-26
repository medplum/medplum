import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconUser } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { EditTab } from './pages/patient/EditTab';
import { EncounterTab } from './pages/patient/EncounterTab';
import { LabsTab } from './pages/patient/LabsTab';
import { MedsTab } from './pages/patient/MedsTab';
import { PatientPage } from './pages/patient/PatientPage';
import { PatientSearchPage } from './pages/patient/PatientSearchPage';
import { TasksTab } from './pages/patient/TasksTab';
import { TimelineTab } from './pages/patient/TimelineTab';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          title: 'Charts',
          links: [{ icon: <IconUser />, label: 'Patients', href: '/' }],
        },
      ]}
    >
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            {profile ? (
              <>
                <Route path="/" element={<HomePage />} />
                <Route path="/Patient/:patientId" element={<PatientPage />}>
                  <Route path="edit" element={<EditTab />} />
                  <Route path="encounter" element={<EncounterTab />} />
                  <Route path="labs" element={<LabsTab />} />
                  <Route path="meds" element={<MedsTab />} />
                  <Route path="tasks" element={<TasksTab />} />
                  <Route path="timeline" element={<TimelineTab />} />
                  <Route path=":resourceType/:id" element={<ResourcePage />} />
                  <Route path=":resourceType" element={<PatientSearchPage />} />
                  <Route path="" element={<TimelineTab />} />
                </Route>
                <Route path="/:resourceType/:id" element={<ResourcePage />} />
                <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
                <Route path="/:resourceType" element={<SearchPage />} />
              </>
            ) : (
              <>
                <Route path="/signin" element={<SignInPage />} />
                <Route path="*" element={<Navigate to="/signin" replace />} />
              </>
            )}
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
