import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Identifier, Patient } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

const MEDPLUM_BOT_SYSTEM = 'https://www.medplum.com/bots';
const DOSESPOT_PATIENT_SYNC_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-patient-sync-bot' };
const DOSESPOT_IFRAME_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-iframe-bot' };

export function DoseSpotTab(): JSX.Element {
  const medplum = useMedplum();
  const { patientId } = useParams();
  const patient = useResource<Patient>(patientId ? { reference: `Patient/${patientId}` } : undefined);
  const initializingRef = useRef<boolean>(false);
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);

  const syncPatient = useCallback(async () => {
    try {
      const result = await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, patient);
      console.log('Sync result:', result);
      showNotification({ color: 'green', title: 'Success', message: 'Patient sync success' });
    } catch (err: unknown) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }, [medplum, patient]);

  const openIframe = useCallback(async () => {
    const doseSpotPatientId = patient?.identifier?.find((i) => i.system === 'https://dosespot.com/patient-id')?.value;
    try {
      const result = await medplum.executeBot(DOSESPOT_IFRAME_BOT, { patientId: doseSpotPatientId });
      if (result.url) {
        setIframeUrl(result.url);
      }
    } catch (err: unknown) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }, [medplum, patient]);

  const initPage = useCallback(async () => {
    if (!initializingRef.current) {
      initializingRef.current = true;
      if (patient) {
        await syncPatient();
      }
      await openIframe();
    }
  }, [patient, syncPatient, openIframe]);

  useEffect(() => {
    initPage().catch(console.error);
  }, [initPage]);

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
