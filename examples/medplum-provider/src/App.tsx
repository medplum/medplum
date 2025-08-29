// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
  IconApps,
  IconCalendarEvent,
  IconClipboardCheck,
  IconMail,
  IconPill,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import { JSX, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { DoseSpotIcon } from './components/DoseSpotIcon';
import { hasDoseSpotIdentifier } from './components/utils';
import './index.css';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { SchedulePage } from './pages/SchedulePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { DoseSpotFavoritesPage } from './pages/integrations/DoseSpotFavoritesPage';
import { EncounterChart } from './pages/encounter/EncounterChart';
import { EncounterModal } from './pages/encounter/EncounterModal';
import { CommunicationTab } from './pages/patient/CommunicationTab';
import { DoseSpotTab } from './pages/patient/DoseSpotTab';
import { EditTab } from './pages/patient/EditTab';
import { ExportTab } from './pages/patient/ExportTab';
import { IntakeFormPage } from './pages/patient/IntakeFormPage';
import { PatientPage } from './pages/patient/PatientPage';
import { PatientSearchPage } from './pages/patient/PatientSearchPage';
import { TimelineTab } from './pages/patient/TimelineTab';
import { ResourceCreatePage } from './pages/resource/ResourceCreatePage';
import { ResourceDetailPage } from './pages/resource/ResourceDetailPage';
import { ResourceEditPage } from './pages/resource/ResourceEditPage';
import { ResourceHistoryPage } from './pages/resource/ResourceHistoryPage';
import { ResourcePage } from './pages/resource/ResourcePage';
import { TaskDetailsModal } from './pages/tasks/TaskDetailsModal';
import { TaskDetails } from './pages/tasks/TaskDetails';
import { MessagesPage } from './pages/messages/MessagesPage';
import { TasksPage } from './pages/tasks/TasksPage';
import { TaskSelectEmpty } from './components/tasks/TaskSelectEmpty';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useMedplumNavigate();
  const location = useLocation();

  if (medplum.isLoading()) {
    return null;
  }

  const membership = medplum.getProjectMembership();
  const hasDoseSpot = hasDoseSpotIdentifier(membership);

  return (
    <AppShell
      logo={<Logo size={24} />}
      pathname={location.pathname}
      searchParams={new URLSearchParams(location.search)}
      menus={[
        {
          links: [
            {
              icon: <IconUsers />,
              label: 'Patients',
              href: '/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated',
            },
          ],
        },
        {
          links: [{ icon: <IconCalendarEvent />, label: 'Schedule', href: '/schedule' }],
        },
        {
          links: [{ icon: <IconMail />, label: 'Messages', href: '/Message' }],
        },
        {
          links: [{ icon: <IconClipboardCheck />, label: 'Tasks', href: '/task' }],
        },
        {
          title: 'Integrations',
          links: [{ icon: <IconApps />, label: 'Add Integrations', href: '/integrations' }],
        },
        {
          title: 'Quick Links',
          links: [
            { icon: <IconUserPlus />, label: 'New Patient', href: '/onboarding' },
            ...(hasDoseSpot
              ? [{ icon: <IconPill />, label: 'DoseSpot Favorites', href: '/integrations/dosespot' }]
              : []),
          ],
        },
      ]}
      resourceTypeSearchDisabled={true}
      navbarLinkStyles={{
        activeColor: 'light-dark(var(--mantine-color-black), var(--mantine-color-white))',
        strokeWidth: 2,
        hoverBackgroundOnly: true,
      }}
      notifications={
        profile && (
          <>
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
              <Route
                path="/"
                element={<Navigate to="/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated" replace />}
              />
              <Route path="/Patient/new" element={<ResourceCreatePage />} />
              <Route path="/Patient/:patientId" element={<PatientPage />}>
                <Route path="Encounter/new" element={<EncounterModal />} />
                <Route path="Encounter/:encounterId" element={<EncounterChart />}>
                  <Route path="Task/:taskId" element={<TaskDetailsModal />} />
                </Route>
                <Route path="edit" element={<EditTab />} />
                <Route path="communication" element={<CommunicationTab />} />
                <Route path="communication/:id" element={<CommunicationTab />} />
                {hasDoseSpot && <Route path="dosespot" element={<DoseSpotTab />} />}
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
              <Route path="/Message" element={<MessagesPage />}>
                <Route index element={<MessagesPage />} />
                <Route path=":messageId" element={<MessagesPage />} />
              </Route>
              <Route path="/Task" element={<TasksPage />}>
                <Route index element={<TaskSelectEmpty />} />
                <Route path=":taskId" element={<TaskDetails />} />
              </Route>
              <Route path="/onboarding" element={<IntakeFormPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/dosespot" element={<DoseSpotTab />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/:resourceType" element={<SearchPage />} />
              <Route path="/:resourceType/new" element={<ResourceCreatePage />} />
              <Route path="/:resourceType/:id" element={<ResourcePage />}>
                <Route path="" element={<ResourceDetailPage />} />
                <Route path="edit" element={<ResourceEditPage />} />
                <Route path="history" element={<ResourceHistoryPage />} />
              </Route>
              {hasDoseSpot && <Route path="/integrations/dosespot" element={<DoseSpotFavoritesPage />} />}
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
