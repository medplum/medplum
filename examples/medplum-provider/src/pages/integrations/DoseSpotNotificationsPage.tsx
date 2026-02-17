// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Group, Paper } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useDoseSpotIFrame } from '@medplum/dosespot-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { Link, useLocation } from 'react-router';
import classes from './DoseSpotNotificationsPage.module.css';

export function DoseSpotNotificationsPage(): JSX.Element {
  const location = useLocation();
  const isFavoritesTab = location.pathname.includes('/favorites');

  const iframeUrl = useDoseSpotIFrame({
    favorites: isFavoritesTab,
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
      <Paper className={classes.tabBar} radius={0}>
        <Group gap="xs" p="md">
          <Button
            component={Link}
            to="/dosespot"
            className={cx(classes.button, { [classes.selected]: !isFavoritesTab })}
            h={32}
            radius="xl"
          >
            Notifications
          </Button>

          <Button
            component={Link}
            to="/dosespot/favorites"
            className={cx(classes.button, { [classes.selected]: isFavoritesTab })}
            h={32}
            radius="xl"
          >
            Favorite Medications
          </Button>
        </Group>
      </Paper>

      <Box className={classes.iframeContainer}>
        {iframeUrl && (
          <iframe
            id={isFavoritesTab ? 'dosespot-favorites-iframe' : 'dosespot-notifications-iframe'}
            name={isFavoritesTab ? 'dosespot-favorites-iframe' : 'dosespot-notifications-iframe'}
            title={isFavoritesTab ? 'dosespot-favorites-iframe' : 'dosespot-notifications-iframe'}
            frameBorder={0}
            src={iframeUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        )}
      </Box>
    </Box>
  );
}
