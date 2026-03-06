// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Center, Loader, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useDoseSpotIFrame } from '@medplum/dosespot-react';
import { useRef } from 'react';
import type { JSX } from 'react';
import { useLocation } from 'react-router';

function getPatientIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/Patient\/([^/]+)/);
  return match?.[1];
}

export function DoseSpotContent(): JSX.Element {
  const location = useLocation();
  const patientId = getPatientIdFromPathname(location.pathname);
  const notifiedRef = useRef(false);
  const iframeUrl = useDoseSpotIFrame({
    patientId,
    onIframeSuccess: () => {
      if (notifiedRef.current) return;
      notifiedRef.current = true;
      showNotification({ color: 'green', title: 'DoseSpot', message: 'Connected to DoseSpot' });
    },
    onError: (err) =>
      showNotification({ color: 'red', title: 'DoseSpot Error', message: normalizeErrorString(err) }),
  });

  if (!iframeUrl) {
    return (
      <Center style={{ flex: 1 }}>
        <div style={{ textAlign: 'center' }}>
          <Loader size="sm" mb="xs" />
          <Text size="sm" c="dimmed">
            Connecting to DoseSpot...
          </Text>
        </div>
      </Center>
    );
  }

  return (
    <iframe
      id="dosespot-panel-iframe"
      name="dosespot-panel-iframe"
      frameBorder={0}
      src={iframeUrl}
      style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
    />
  );
}
