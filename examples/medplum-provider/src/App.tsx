import { ProfileResource, getReferenceString } from '@medplum/core';
import {
  AppShell,
  Loading,
  Logo,
  NotificationIcon,
  useMedplum,
  useMedplumNavigate,
  useMedplumProfile,
} from '@medplum/react';
import {
  IconCalendar,
  IconClipboardCheck,
  IconMail,
  IconPencil,
  IconTimeDuration0,
  IconTimeDuration15,
  IconUser,
} from '@tabler/icons-react';
import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ResourceCreatePage } from './pages/resource/ResourceCreatePage';
import { HomePage } from './pages/HomePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { EditTab } from './pages/patient/EditTab';
import { EncounterTab } from './pages/patient/EncounterTab';
import { PatientPage } from './pages/patient/PatientPage';
import { PatientSearchPage } from './pages/patient/PatientSearchPage';
import { TimelineTab } from './pages/patient/TimelineTab';
import { ResourceDetailPage } from './pages/resource/ResourceDetailPage';
import { ResourceEditPage } from './pages/resource/ResourceEditPage';
import { ResourceHistoryPage } from './pages/resource/ResourceHistoryPage';
import { ResourcePage } from './pages/resource/ResourcePage';
import { CommunicationTab } from './pages/patient/CommunicationTab';
import { TaskTab } from './pages/patient/TaskTab';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useMedplumNavigate();

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
      resourceTypeSearchDisabled={true}
      notifications={
        profile && (
          <>
            <NotificationIcon
              label="Mail"
              resourceType="Communication"
              countCriteria={`recipient=${getReferenceString(profile as ProfileResource)}&status:not=completed&_summary=count`}
              subscriptionCriteria={`Communication?recipient=${getReferenceString(profile as ProfileResource)}`}
              iconComponent={<IconMail />}
              onClick={() =>
                navigate(
                  `/Communication?recipient=${getReferenceString(profile as ProfileResource)}&status:not=completed&_fields=sender,recipient,subject,status,_lastUpdated`
                )
              }
            />
            <NotificationIcon
              label="Tasks"
              resourceType="Task"
              countCriteria={`owner=${getReferenceString(profile as ProfileResource)}&status:not=completed&_summary=count`}
              subscriptionCriteria={`Task?owner=${getReferenceString(profile as ProfileResource)}`}
              iconComponent={<IconClipboardCheck />}
              onClick={() =>
                navigate(
                  `/Task?owner=${getReferenceString(profile as ProfileResource)}&status:not=completed&_fields=subject,code,description,status,_lastUpdated`
                )
              }
            />
          </>
        )
      }
    >
      <Suspense fallback={<Loading />}>
        <Routes>
          {profile ? (
            <>
              <Route path="/" element={<HomePage />} />
              <Route path="/Patient/:patientId" element={<PatientPage />}>
                <Route path="edit" element={<EditTab />} />
                <Route path="encounter" element={<EncounterTab />} />
                <Route path="communication" element={<CommunicationTab />} />
                <Route path="communication/:id" element={<CommunicationTab />} />
                <Route path="task/:id/*" element={<TaskTab />} />
                <Route path="timeline" element={<TimelineTab />} />
                <Route path=":resourceType" element={<PatientSearchPage />} />
                <Route path=":resourceType/new" element={<ResourceCreatePage />} />
                <Route path=":resourceType/:id" element={<ResourcePage />}>
                  <Route path="" element={<ResourceDetailPage />} />
                  <Route path="edit" element={<ResourceEditPage />} />
                  <Route path="history" element={<ResourceHistoryPage />} />
                </Route>
                <Route path="" element={<TimelineTab />} />
              </Route>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/:resourceType" element={<SearchPage />} />
              <Route path="/:resourceType/new" element={<ResourceCreatePage />} />
              <Route path="/:resourceType/:id" element={<ResourcePage />}>
                <Route path="" element={<ResourceDetailPage />} />
                <Route path="edit" element={<ResourceEditPage />} />
                <Route path="history" element={<ResourceHistoryPage />} />
              </Route>
            </>
          ) : (
            <>
              <Route path="/signin" element={<SignInPage />} />
              <Route path="*" element={<Navigate to="/signin" replace />} />
            </>
          )}
        </Routes>
      </Suspense>
    </AppShell>
  );
}
