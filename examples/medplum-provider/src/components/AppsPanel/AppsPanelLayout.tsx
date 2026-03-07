// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { formatHumanName } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { IconChartAreaLineFilled, IconClipboardSmileFilled, IconVideoFilled } from '@tabler/icons-react';
import type { JSX, ReactElement, ReactNode } from 'react';
import { useLocation } from 'react-router';
import { AppsPanel } from './AppsPanel';
import classes from './AppsPanel.module.css';
import { useAppsPanel } from './AppsPanelContext';
import { DoseSpotContent } from './DoseSpotContent';
import { DoseSpotProviderContent } from './DoseSpotProviderContent';
import { GrowthChartContent } from './GrowthChartContent';
import { PopulationHealthContent } from './PopulationHealthContent';
import { TelehealthContent } from './TelehealthContent';

interface AppMeta {
  title: string;
  icon?: ReactElement;
}

const appMeta: Record<string, AppMeta> = {
  'growth-chart': {
    title: 'Growth Chart',
    icon: <IconChartAreaLineFilled size={18} color="var(--mantine-color-blue-6)" />,
  },
  dosespot: {
    title: 'DoseSpot',
    icon: <img src="/img/dosespot-icon.png" alt="DoseSpot" style={{ width: 18, height: 18, objectFit: 'contain' }} />,
  },
  'carebridge-dashboard': {
    title: 'Population Health',
    icon: <IconClipboardSmileFilled size={18} color="var(--mantine-color-teal-6)" />,
  },
  telehealth: {
    title: 'TelehealthBridge',
    icon: <IconVideoFilled size={18} color="var(--mantine-color-violet-6)" />,
  },
  'dosespot-provider': {
    title: 'DoseSpot Provider',
    icon: <img src="/img/dosespot-icon.png" alt="DoseSpot" style={{ width: 18, height: 18, objectFit: 'contain' }} />,
  },
};

function getPatientIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/Patient\/([^/]+)/);
  return match?.[1];
}

function useAppTitle(appId: string | null): ReactNode {
  const location = useLocation();
  const patientId = getPatientIdFromPathname(location.pathname);
  const patient = useResource<Patient>(patientId ? { reference: `Patient/${patientId}` } : undefined);

  const baseTitle = (appId && appMeta[appId]?.title) ?? 'App';

  const showPatientName = appId === 'dosespot' || appId === 'growth-chart' || appId === 'telehealth';
  if (showPatientName && patient?.name?.[0] && appId && appMeta[appId]) {
    const name = formatHumanName(patient.name[0], { prefix: false, suffix: false });
    if (name) {
      return (
        <>
          {appMeta[appId].title}
          <span style={{ fontWeight: 400, paddingLeft: 6, color: 'var(--mantine-color-gray-6)' }}>for {name}</span>
        </>
      );
    }
  }

  return baseTitle;
}

function AppsPanelContent({ appId }: { readonly appId: string }): JSX.Element | null {
  switch (appId) {
    case 'growth-chart':
      return <GrowthChartContent />;
    case 'dosespot':
      return <DoseSpotContent />;
    case 'carebridge-dashboard':
      return <PopulationHealthContent />;
    case 'telehealth':
      return <TelehealthContent />;
    case 'dosespot-provider':
      return <DoseSpotProviderContent />;
    default:
      return null;
  }
}

export function AppsPanelLayout({ children }: { readonly children: ReactNode }): JSX.Element {
  const { openAppId } = useAppsPanel();
  const title = useAppTitle(openAppId);

  return (
    <div className={classes.layout}>
      <div className={classes.mainContent}>{children}</div>
      {openAppId && (
        <>
          <div className={classes.panelSpacer} />
          <AppsPanel title={title} icon={appMeta[openAppId]?.icon}>
            <AppsPanelContent appId={openAppId} />
          </AppsPanel>
        </>
      )}
    </div>
  );
}
