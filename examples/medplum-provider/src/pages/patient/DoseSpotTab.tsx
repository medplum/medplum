// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useDoseSpotIFrame } from '@medplum/dosespot-react';
import { JSX } from 'react';
import { useParams } from 'react-router';
import { DoseSpotAdvancedOptions } from './DoseSpotAdvancedOptions';

export function DoseSpotTab(): JSX.Element {
  const { patientId } = useParams();
  const iframeUrl = useDoseSpotIFrame({
    patientId,
    onPatientSyncSuccess: () => showNotification({ color: 'green', title: 'Success', message: 'Patient sync success' }),
    onIframeSuccess: () => showNotification({ color: 'green', title: 'Success', message: 'DoseSpot iframe success' }),
    onError: (err) => showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) }),
  });

  return (
    <Box pos="relative">
      {patientId && <DoseSpotAdvancedOptions patientId={patientId} />}

      <div>
        {iframeUrl && (
          <iframe
            id="dosespot-iframe"
            name="dosespot-iframe"
            frameBorder={0}
            src={iframeUrl}
            style={{ width: '100%', height: '100%', minHeight: 'calc(100vh)', border: 'none' }}
          ></iframe>
        )}
      </div>
    </Box>
  );
}
