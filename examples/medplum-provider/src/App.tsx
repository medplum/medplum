import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import {
  IconCalendar,
  IconHammer,
  IconMessage,
  IconPencil,
  IconTimeDuration0,
  IconTimeDuration15,
  IconUser,
} from '@tabler/icons-react';
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
import { OnboardingPage } from './pages/OnboardingPage';

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
        {
          title: 'To Dos',
          links: [
            { icon: <IconHammer />, label: 'Tasks', href: '/Task' },
            { icon: <IconMessage />, label: 'Messages', href: '/Communication' },
          ],
        },
        {
          title: 'Scheduling',
          links: [
            { icon: <IconTimeDuration0 />, label: 'New Appointment', href: '/Appointment/new' },
            {
              icon: <IconTimeDuration15 />,
              label: 'Appointment Requests',
              href: '/Appointment?_count=20&_fields=_lastUpdated,patient,practitioner,start,end,serviceType&_offset=0&_sort=-_lastUpdated&status=proposed',
            },
            {
              icon: <IconCalendar />,
              label: 'Upcoming Appointments',
              href: '/Appointment?_count=20&_fields=_lastUpdated,patient,practitioner,start,end,serviceType&_offset=0&_sort=-_lastUpdated&status=booked',
            },
          ],
        },
        {
          title: 'Onboarding',
          links: [{ icon: <IconPencil />, label: 'New Patient', href: '/onboarding' }],
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
                <Route path="/onboarding" element={<OnboardingPage />} />
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
