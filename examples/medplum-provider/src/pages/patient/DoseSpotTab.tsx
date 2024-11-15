import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useDoseSpotIFrame } from '@medplum/dosespot-react';
import { useParams } from 'react-router-dom';

export function DoseSpotTab(): JSX.Element {
  const { patientId } = useParams();
  const iframeUrl = useDoseSpotIFrame({
    patientId,
    onPatientSyncSuccess: () => showNotification({ color: 'green', title: 'Success', message: 'Patient sync success' }),
    onIframeSuccess: () => showNotification({ color: 'green', title: 'Success', message: 'DoseSpot iframe success' }),
    onError: (err) => showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) }),
  });

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 200px)' }}>
      {iframeUrl && (
        <iframe
          id="dosespot-iframe"
          name="dosespot-iframe"
          frameBorder={0}
          src={iframeUrl}
          style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 200px)', border: 'none' }}
        ></iframe>
      )}
    </div>
  );
}
