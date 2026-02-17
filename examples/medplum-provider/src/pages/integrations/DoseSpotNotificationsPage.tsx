// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useDoseSpotIFrame } from '@medplum/dosespot-react';
import type { JSX } from 'react';
import classes from './DoseSpotNotificationsPage.module.css';

export function DoseSpotNotificationsPage(): JSX.Element {
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
    <Box className={classes.container}>
      <Box className={classes.iframeContainer}>
        {iframeUrl && (
          <iframe
            id="dosespot-notifications-iframe"
            name="dosespot-notifications-iframe"
            title="dosespot-notifications-iframe"
            frameBorder={0}
            src={iframeUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        )}
      </Box>
    </Box>
  );
}
