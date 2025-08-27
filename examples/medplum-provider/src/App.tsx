// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ProfileResource, getReferenceString } from '@medplum/core';
import { Questionnaire } from '@medplum/fhirtypes';
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
  IconClipboardCheck,
  IconFileExport,
  IconForms,
  IconMail,
  IconPencil,
  IconPill,
  IconTimeDuration0,
  IconToggleRightFilled,
  IconTransformPoint,
  IconUser,
} from '@tabler/icons-react';
import { JSX, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { DoseSpotIcon } from './components/DoseSpotIcon';
import { hasDoseSpotIdentifier } from './components/utils';
import { TaskSelectEmpty } from './components/tasks/TaskSelectEmpty';
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
import { showErrorNotification } from './utils/notifications';
import { BulkCertificationPage } from './pages/BulkCertificationPage';
import { C1CertificationPage } from './pages/C1CertificationPage';
import { DSIPage } from './pages/dsi/DSIPage';
import { FormPage } from './pages/FormPage';
import { DSIFeedbackPage } from './pages/dsi/DSIFeedbackPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useMedplumNavigate();

  const [dsiSourceAttributesQuestionnaires, setDSISourceAttributesQuestionnaires] = useState<
    Questionnaire[] | undefined
  >();

  useEffect(() => {
    medplum
      .searchResources('Questionnaire', [
        ['identifier', 'b11-evidence-based-dsi-source-attributes,b11-predictive-dsi-source-attributes'],
        ['_sort', 'name'],
      ])
      .then((resources) => setDSISourceAttributesQuestionnaires(resources))
      .catch((err) => {
        showErrorNotification(err);
      });
  }, [medplum]);

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
          links: [
            {
              icon: <IconUser />,
              label: 'Patients',
              href: '/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated',
            },
          ],
        },
        {
          title: 'Scheduling',
          links: [{ icon: <IconTimeDuration0 />, label: 'Schedule', href: '/schedule' }],
        },
        {
          title: 'Communication',
          links: [{ icon: <IconMail />, label: 'Messages', href: '/Message' }],
        },
        {
          title: 'Tasks',
          links: [{ icon: <IconClipboardCheck />, label: 'Tasks', href: '/Task' }],
        },
        {
          title: 'Onboarding',
          links: [{ icon: <IconPencil />, label: 'New Patient', href: '/onboarding' }],
        },
        {
          title: 'Integrations',
          links: [
            { icon: <IconTransformPoint />, label: 'Integrations', href: '/integrations' },
            ...(hasDoseSpot ? [{ icon: <IconPill />, label: 'DoseSpot', href: '/integrations/dosespot' }] : []),
          ],
        },
        {
          title: 'Decision Support',
          links: [
            { icon: <IconToggleRightFilled />, label: 'Decision Support Interventions', href: '/dsi' },
            { icon: <IconFileExport />, label: 'Feedback Export', href: '/dsi/feedback' },
            ...(dsiSourceAttributesQuestionnaires?.map((q) => ({
              icon: <IconForms />,
              label: q.title,
              href: `/forms/${q.id}`,
            })) ?? []),
            {
              icon: <IconTransformPoint />,
              label: 'Integrations',
              href: '/ClientApplication?_count=20&_fields=_lastUpdated,name&_sort=-_lastUpdated',
            },
          ],
        },
      ]}
      resourceTypeSearchDisabled={true}
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
              <Route path="/bulk/:resourceType" element={<BulkCertificationPage />} />
              <Route path="/forms/:id" element={<FormPage />} />
              <Route path="/c1/:id" element={<C1CertificationPage />} />
              <Route path="/dsi" element={<DSIPage />} />
              <Route path="/dsi/feedback" element={<DSIFeedbackPage />} />
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
