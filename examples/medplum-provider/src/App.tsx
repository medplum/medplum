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
import { IconClipboardCheck, IconMail, IconPencil, IconTimeDuration0, IconUser } from '@tabler/icons-react';
import { JSX, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { DoseSpotIcon } from './components/DoseSpotIcon';
import { hasDoseSpotIdentifier } from './components/utils';
import './index.css';
import { HomePage } from './pages/HomePage';
import { SchedulePage } from './pages/SchedulePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { EncounterChart } from './pages/encounter/EncounterChart';
import { EncounterComplete } from './pages/encounter/EncounterComplete';
import { EncounterModal } from './pages/encounter/EncounterModal';
import { CommunicationTab } from './pages/patient/CommunicationTab';
import { DoseSpotTab } from './pages/patient/DoseSpotTab';
import { EditTab } from './pages/patient/EditTab';
import { ExportTab } from './pages/patient/ExportTab';
import { IntakeFormPage } from './pages/patient/IntakeFormPage';
import { PatientPage } from './pages/patient/PatientPage';
import { PatientSearchPage } from './pages/patient/PatientSearchPage';
import { TaskTab } from './pages/patient/TaskTab';
import { TimelineTab } from './pages/patient/TimelineTab';
import { ResourceCreatePage } from './pages/resource/ResourceCreatePage';
import { ResourceDetailPage } from './pages/resource/ResourceDetailPage';
import { ResourceEditPage } from './pages/resource/ResourceEditPage';
import { ResourceHistoryPage } from './pages/resource/ResourceHistoryPage';
import { ResourcePage } from './pages/resource/ResourcePage';
import { TaskDetails } from './pages/tasks/TaskDetails';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useMedplumNavigate();

  if (medplum.isLoading()) {
    return null;
  }

  const membership = medplum.getProjectMembership();
  const hasDoseSpot = hasDoseSpotIdentifier(membership);

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
          links: [{ icon: <IconTimeDuration0 />, label: 'Schedule', href: '/schedule' }],
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
            {hasDoseSpot && <DoseSpotIcon />}
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
                <Route path="Encounter/new" element={<EncounterModal />} />
                <Route path="Encounter/:encounterId" element={<Navigate to="chart" replace />} />
                <Route path="Encounter/:encounterId/chart" element={<EncounterChart />}>
                  <Route path="Task/:taskId" element={<TaskDetails />} />
                </Route>
                <Route path="Encounter/:encounterId/complete" element={<EncounterComplete />}></Route>
                <Route path="edit" element={<EditTab />} />
                <Route path="communication" element={<CommunicationTab />} />
                <Route path="communication/:id" element={<CommunicationTab />} />
                {hasDoseSpot && <Route path="dosespot" element={<DoseSpotTab />} />}
                <Route path="Task/:id">
                  <Route index element={<TaskTab />} />
                  <Route path="*" element={<TaskTab />} />
                </Route>
                <Route path="timeline" element={<TimelineTab />} />
                <Route path="export" element={<ExportTab />} />
                <Route path=":resourceType" element={<PatientSearchPage />} />
                <Route path=":resourceType/new" element={<ResourceCreatePage />} />
                <Route path=":resourceType/:id" element={<ResourcePage />}>
                  <Route path="" element={<ResourceDetailPage />} />
                  <Route path="edit" element={<ResourceEditPage />} />
                  <Route path="history" element={<ResourceHistoryPage />} />
                </Route>
                <Route path="" element={<TimelineTab />} />
              </Route>
              <Route path="Task/:id">
                <Route index element={<TaskTab />} />
                <Route path="*" element={<TaskTab />} />
              </Route>
              <Route path="/onboarding" element={<IntakeFormPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/dosespot" element={<DoseSpotTab />} />
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
