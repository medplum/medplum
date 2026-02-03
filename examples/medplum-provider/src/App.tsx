// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import { AppShell, Loading, Logo, NotificationIcon, useMedplum, useMedplumProfile } from '@medplum/react';
import {
  IconApps,
  IconBook2,
  IconCalendarEvent,
  IconClipboardCheck,
  IconMail,
  IconSettingsAutomation,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { Suspense, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { DismissableNavIcon } from './components/DismissableNavIcon';
import { DoseSpotIcon } from './components/DoseSpotIcon';
import { TaskDetailsModal } from './components/tasks/TaskDetailsModal';
import { hasDoseSpotIdentifier } from './components/utils';
import './index.css';

const SETUP_DISMISSED_KEY = 'medplum-provider-setup-dismissed';

import { EncounterChartPage } from './pages/encounter/EncounterChartPage';
import { EncounterModal } from './pages/encounter/EncounterModal';
import { DoseSpotFavoritesPage } from './pages/integrations/DoseSpotFavoritesPage';
import { IntegrationsPage } from './pages/integrations/IntegrationsPage';
import { MessagesPage } from './pages/messages/MessagesPage';
import { CommunicationTab } from './pages/patient/CommunicationTab';
import { DoseSpotTab } from './pages/patient/DoseSpotTab';
import { EditTab } from './pages/patient/EditTab';
import { ExportTab } from './pages/patient/ExportTab';
import { IntakeFormPage } from './pages/patient/IntakeFormPage';
import { LabsPage } from './pages/patient/LabsPage';
import { PatientPage } from './pages/patient/PatientPage';
import { PatientSearchPage } from './pages/patient/PatientSearchPage';
import { TasksTab } from './pages/patient/TasksTab';
import { TimelineTab } from './pages/patient/TimelineTab';
import { ResourceCreatePage } from './pages/resource/ResourceCreatePage';
import { ResourceDetailPage } from './pages/resource/ResourceDetailPage';
import { ResourceEditPage } from './pages/resource/ResourceEditPage';
import { ResourceHistoryPage } from './pages/resource/ResourceHistoryPage';
import { ResourcePage } from './pages/resource/ResourcePage';
import { SchedulePage } from './pages/schedule/SchedulePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { SpacesPage } from './pages/spaces/SpacesPage';
import { TasksPage } from './pages/tasks/TasksPage';
import { GetStartedPage } from './pages/getstarted/GetStartedPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [setupDismissed, setSetupDismissed] = useState(() => localStorage.getItem(SETUP_DISMISSED_KEY) === 'true');

  const handleDismissSetup = (): void => {
    localStorage.setItem(SETUP_DISMISSED_KEY, 'true');
    setSetupDismissed(true);
  };

  if (medplum.isLoading()) {
    return null;
  }

  const membership = medplum.getProjectMembership();
  const hasDoseSpot = hasDoseSpotIdentifier(membership);

  return (
    <AppShell
      logo={<Logo size={24} />}
      pathname={location.pathname}
      searchParams={searchParams}
      layoutVersion="v2"
      showLayoutVersionToggle={false}
      menus={
        profile
          ? [
              {
                links: [
                  { icon: <IconBook2 />, label: 'Spaces', href: '/Spaces/Communication' },
                  {
                    icon: <IconUsers />,
                    label: 'Patients',
                    href: '/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated',
                  },
                  { icon: <IconCalendarEvent />, label: 'Schedule', href: '/schedule' },
                  {
                    icon: (
                      <NotificationIcon
                        resourceType="Communication"
                        countCriteria={`recipient=${getReferenceString(profile)}&status:not=completed&_summary=count`}
                        subscriptionCriteria={`Communication?recipient=${getReferenceString(profile)}`}
                        iconComponent={<IconMail />}
                      />
                    ),
                    label: 'Messages',
                    href: `/Communication?status=in-progress`,
                  },
                  {
                    icon: (
                      <NotificationIcon
                        resourceType="Task"
                        countCriteria={`owner=${getReferenceString(profile)}&status=requested,ready,received,accepted,in-progress,draft&_summary=count`}
                        subscriptionCriteria={`Task?owner=${getReferenceString(profile)}&status=requested,ready,received,accepted,in-progress,draft`}
                        iconComponent={<IconClipboardCheck />}
                      />
                    ),
                    label: 'Tasks',
                    href: `/Task?owner=${getReferenceString(profile)}&_sort=-_lastUpdated&status=requested,ready,received,accepted,in-progress,draft`,
                  },
                ],
              },
              {
                title: 'Quick Links',
                links: [
                  ...(!setupDismissed
                    ? [
                        {
                          icon: <DismissableNavIcon icon={<IconSettingsAutomation />} onDismiss={handleDismissSetup} />,
                          label: 'Get Started',
                          href: '/getstarted',
                        },
                      ]
                    : []),
                  { icon: <IconUserPlus />, label: 'New Patient', href: '/onboarding' },
                  { icon: <IconApps />, label: 'Integrations', href: '/integrations' },
                  ...(hasDoseSpot
                    ? [{ icon: <DoseSpotIcon />, label: 'DoseSpot', href: '/integrations/dosespot' }]
                    : []),
                ],
              },
            ]
          : undefined
      }
      resourceTypeSearchDisabled={true}
      spotlightPatientsOnly={true}
    >
      <Suspense fallback={<Loading />}>
        <Routes>
          {profile ? (
            <>
              <Route path="/getstarted" element={<GetStartedPage />} />
              <Route path="/Spaces/Communication" element={<SpacesPage />}>
                <Route index element={<SpacesPage />} />
                <Route path=":topicId" element={<SpacesPage />} />
              </Route>
              <Route
                path="/"
                element={
                  <Navigate
                    to={
                      setupDismissed
                        ? '/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated'
                        : '/getstarted'
                    }
                    replace
                  />
                }
              />
              <Route path="/Patient/new" element={<ResourceCreatePage />} />
              <Route path="/Patient/:patientId" element={<PatientPage />}>
                <Route path="Encounter/new" element={<EncounterModal />} />
                <Route path="Encounter/:encounterId" element={<EncounterChartPage />}>
                  <Route path="Task/:taskId" element={<TaskDetailsModal />} />
                </Route>
                <Route path="edit" element={<EditTab />} />
                <Route path="Communication" element={<CommunicationTab />} />
                <Route path="Communication/:messageId" element={<CommunicationTab />} />
                <Route path="Task" element={<TasksTab />} />
                <Route path="Task/:taskId" element={<TasksTab />} />
                {hasDoseSpot && <Route path="dosespot" element={<DoseSpotTab />} />}
                <Route path="timeline" element={<TimelineTab />} />
                <Route path="export" element={<ExportTab />} />
                <Route path="ServiceRequest" element={<LabsPage />} />
                <Route path="ServiceRequest/:serviceRequestId" element={<LabsPage />} />
                <Route path=":resourceType" element={<PatientSearchPage />} />
                <Route path=":resourceType/new" element={<ResourceCreatePage />} />
                <Route path=":resourceType/:id" element={<ResourcePage />}>
                  <Route path="" element={<ResourceDetailPage />} />
                  <Route path="edit" element={<ResourceEditPage />} />
                  <Route path="history" element={<ResourceHistoryPage />} />
                </Route>
                <Route path="" element={<TimelineTab />} />
              </Route>
              <Route path="/Communication" element={<MessagesPage />}>
                <Route index element={<MessagesPage />} />
                <Route path=":messageId" element={<MessagesPage />} />
              </Route>
              <Route path="Task" element={<TasksPage />} />
              <Route path="Task/:taskId" element={<TasksPage />} />
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
