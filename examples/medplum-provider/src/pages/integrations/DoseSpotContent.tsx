// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Paper, Tabs } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useDoseSpotIFrame } from '@medplum/dosespot-react';
import type { JSX } from 'react';
import { useState } from 'react';
import classes from './DoseSpotNotificationsPage.module.css';

export type DoseSpotTabValue = 'notifications' | 'favorites';

export interface DoseSpotContentProps {
  /** When provided, tab is controlled by parent (e.g. from route). When undefined, uses internal state (e.g. in panel). */
  readonly tab?: DoseSpotTabValue;
  readonly onTabChange?: (value: DoseSpotTabValue) => void;
  /** When true, container fills available height (e.g. in panel). Default true. */
  readonly fillHeight?: boolean;
}

export function DoseSpotContent(props: DoseSpotContentProps): JSX.Element {
  const { tab: controlledTab, onTabChange, fillHeight = true } = props;
  const [internalTab, setInternalTab] = useState<DoseSpotTabValue>('notifications');
  const tab = controlledTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;

  const iframeUrl = useDoseSpotIFrame({
    onIframeSuccess: () =>
      showNotification({
        color: 'green',
        icon: '✓',
        title: 'Successfully connected to DoseSpot',
        message: '',
      }),
    onError: (err) => showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) }),
  });

  return (
    <Box
      className={classes.container}
      style={fillHeight ? { height: '100%' } : { height: 'auto' }}
    >
      <Paper className={classes.tabBar} radius={0} p="md">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as DoseSpotTabValue)}
          variant="unstyled"
        >
          <Tabs.List className={classes.tabList}>
            <Tabs.Tab value="notifications" className={classes.tab}>
              Notifications
            </Tabs.Tab>
            <Tabs.Tab value="favorites" className={classes.tab}>
              Favorite Medications
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Paper>

      <Box className={classes.iframeContainer}>
        {iframeUrl && (
          <iframe
            id={tab === 'favorites' ? 'dosespot-favorites-iframe' : 'dosespot-notifications-iframe'}
            name={tab === 'favorites' ? 'dosespot-favorites-iframe' : 'dosespot-notifications-iframe'}
            title={tab === 'favorites' ? 'dosespot-favorites-iframe' : 'dosespot-notifications-iframe'}
            frameBorder={0}
            src={iframeUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        )}
      </Box>
    </Box>
  );
}
