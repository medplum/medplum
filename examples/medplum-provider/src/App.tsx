// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import { useDoseSpotNotifications } from '@medplum/dosespot-react';
import type { NavbarApp, NavbarMenu } from '@medplum/react';
import { AppShell, Loading, Logo, NotificationIcon, useMedplum, useMedplumProfile } from '@medplum/react';
import {
  IconBook2,
  IconCalendarEvent,
  IconChartAreaLineFilled,
  IconClipboardCheck,
  IconClipboardSmileFilled,
  IconMail,
  IconUsers,
  IconVideoFilled,
  IconWorldSearch,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { Suspense, useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { AppsPanelLayout, AppsPanelProvider, useAppsPanel } from './components/AppsPanel';
import { DoseSpotTileIcon } from './components/DoseSpotIcon';
import { TaskDetailsModal } from './components/tasks/TaskDetailsModal';
import { hasDoseSpotIdentifier } from './components/utils';
import './index.css';
import {
  BrowsePage,
  CollectionDetailPage,
  CollectionsPage,
  InstalledItemsPage,
  ListingDetailPage,
  MarketplaceLayout,
  MarketplacePage,
  MarketplaceProvider,
  PartnersPage,
  useMarketplace,
} from './marketplace';
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

export function App(): JSX.Element | null {
  const medplum = useMedplum();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <MarketplaceProvider>
      <AppsPanelProvider>
        <AppShellWithPanel />
      </AppsPanelProvider>
    </MarketplaceProvider>
  );
}

function AppShellWithPanel(): JSX.Element {
  const profile = useMedplumProfile();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isInstalled } = useMarketplace();
  const { openApp, openAppId, closePanel } = useAppsPanel();
  const medplum = useMedplum();

  const membership = medplum.getProjectMembership();
  const hasDoseSpot = hasDoseSpotIdentifier(membership);

  const hasGrowthChart = isInstalled('growth-chart-app');
  const hasDoseSpotApp = isInstalled('dosespot-eprescribing');
  const hasDoseSpotProvider = isInstalled('dosespot-provider-example');
  const hasCareBridge = isInstalled('carebridge-dashboard');
  const hasTelehealth = isInstalled('telehealth-bridge');
  const doseSpotHasNotifications = !!useDoseSpotNotifications();

  const menus: NavbarMenu[] | undefined = useMemo(() => {
    if (!profile) {
      return undefined;
    }

    const mainMenus: NavbarMenu[] = [
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
          { icon: <IconWorldSearch />, label: 'Marketplace', href: '/marketplace' },
        ],
      },
    ];

    return mainMenus;
  }, [profile]);

  const apps: NavbarApp[] = useMemo(() => {
    const result: NavbarApp[] = [];
    if (hasDoseSpotApp) {
      const isActive = openAppId === 'dosespot';
      result.push({
        id: 'dosespot',
        icon: <DoseSpotTileIcon />,
        label: 'DoseSpot',
        active: isActive,
        hasNotification: doseSpotHasNotifications,
        onClick: () => (isActive ? closePanel() : openApp('dosespot')),
      });
    }
    if (hasGrowthChart) {
      const isActive = openAppId === 'growth-chart';
      result.push({
        id: 'growth-chart',
        icon: <IconChartAreaLineFilled style={{ color: 'var(--mantine-color-blue-6)' }} />,
        label: 'Growth Chart',
        active: isActive,
        onClick: () => (isActive ? closePanel() : openApp('growth-chart')),
      });
    }
    if (hasCareBridge) {
      const isActive = openAppId === 'carebridge-dashboard';
      result.push({
        id: 'carebridge-dashboard',
        icon: <IconClipboardSmileFilled style={{ color: 'var(--mantine-color-teal-6)' }} />,
        label: 'Population Health',
        active: isActive,
        onClick: () => (isActive ? closePanel() : openApp('carebridge-dashboard')),
      });
    }
    if (hasTelehealth) {
      const isActive = openAppId === 'telehealth';
      result.push({
        id: 'telehealth',
        icon: <IconVideoFilled style={{ color: 'var(--mantine-color-violet-6)' }} />,
        label: 'TelehealthBridge',
        active: isActive,
        onClick: () => (isActive ? closePanel() : openApp('telehealth')),
      });
    }
    if (hasDoseSpotProvider) {
      const isActive = openAppId === 'dosespot-provider';
      result.push({
        id: 'dosespot-provider',
        icon: <DoseSpotTileIcon />,
        label: 'DoseSpot Provider',
        active: isActive,
        onClick: () => (isActive ? closePanel() : openApp('dosespot-provider')),
      });
    }
    return result;
  }, [
    hasDoseSpotApp,
    hasDoseSpotProvider,
    hasGrowthChart,
    hasCareBridge,
    hasTelehealth,
    doseSpotHasNotifications,
    openApp,
    openAppId,
    closePanel,
  ]);

  return (
    <AppShell
      logo={<Logo size={24} />}
      pathname={location.pathname}
      searchParams={searchParams}
      menus={menus}
      apps={apps}
      resourceTypeSearchDisabled={true}
      spotlightPatientsOnly={true}
    >
      <AppsPanelLayout>
        <Suspense fallback={<Loading />}>
          <Routes>
            {profile ? (
              <>
                <Route path="/Spaces/Communication" element={<SpacesPage />}>
                  <Route index element={<SpacesPage />} />
                  <Route path=":topicId" element={<SpacesPage />} />
                </Route>
                <Route
                  path="/"
                  element={<Navigate to="/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated" replace />}
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
                <Route path="/marketplace" element={<MarketplaceLayout />}>
                  <Route index element={<MarketplacePage />} />
                  <Route path="browse" element={<BrowsePage />} />
                  <Route path="installed" element={<InstalledItemsPage />} />
                  <Route path="collections" element={<CollectionsPage />} />
                  <Route path="collections/:collectionId" element={<CollectionDetailPage />} />
                  <Route path="partners" element={<PartnersPage />} />
                  <Route path=":listingId" element={<ListingDetailPage />} />
                </Route>
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
      </AppsPanelLayout>
    </AppShell>
  );
}
