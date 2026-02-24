// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useDoseSpotIFrame } from '@medplum/dosespot-react';
import { useRef } from 'react';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function DoseSpotTab(): JSX.Element {
  const { patientId } = useParams();
  const syncedRef = useRef(false);
  const iframeLoadedRef = useRef(false);

  const checkAndNotify = (): void => {
    if (syncedRef.current && iframeLoadedRef.current) {
      showNotification({
        color: 'green',
        icon: '✓',
        title: 'Successfully connected to DoseSpot',
        message: 'Patient information synced',
      });
    }
  };

  const iframeUrl = useDoseSpotIFrame({
    patientId,
    onPatientSyncSuccess: () => {
      syncedRef.current = true;
      checkAndNotify();
    },
    onIframeSuccess: () => {
      iframeLoadedRef.current = true;
      checkAndNotify();
    },
    onError: (err) => showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) }),
  });

  return (
    <Box style={{ flex: 1, minHeight: 0 }}>
      {iframeUrl && (
        <iframe
          id="dosespot-iframe"
          name="dosespot-iframe"
          frameBorder={0}
          src={iframeUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
        ></iframe>
      )}
    </Box>
  );
}
