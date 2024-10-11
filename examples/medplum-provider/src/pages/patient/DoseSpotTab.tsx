import { Button, Group, Loader, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Identifier } from '@medplum/fhirtypes';
import { Container, Panel, useMedplum } from '@medplum/react';
import { useCallback, useState } from 'react';
import { usePatient } from '../../hooks/usePatient';

const MEDPLUM_BOT_SYSTEM = 'https://www.medplum.com/bots';
const DOSESPOT_CONNECTION_TEST_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-connection-test-bot' };
const DOSESPOT_PATIENT_SEARCH_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-patient-search-bot' };
const DOSESPOT_PATIENT_SYNC_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-patient-sync-bot' };
const DOSESPOT_IFRAME_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-iframe-bot' };

export function DoseSpotTab(): JSX.Element {
  const medplum = useMedplum();
  const patient = usePatient();
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);

  const handleTestConnectivity = useCallback(async () => {
    try {
      await medplum.executeBot(DOSESPOT_CONNECTION_TEST_BOT, {});
      showNotification({ color: 'green', title: 'Success', message: 'Connection test successful' });
    } catch (err: unknown) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }, [medplum]);

  const handleSearchPatients = useCallback(async () => {
    try {
      const result = await medplum.executeBot(DOSESPOT_PATIENT_SEARCH_BOT, {});
      console.log('Search result:', result);
      showNotification({ color: 'green', title: 'Success', message: 'Patient search success' });
    } catch (err: unknown) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }, [medplum]);

  const handleSyncPatient = useCallback(async () => {
    try {
      const result = await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, patient);
      console.log('Sync result:', result);
      showNotification({ color: 'green', title: 'Success', message: 'Patient sync success' });
    } catch (err: unknown) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }, [medplum, patient]);

  const handleStartNewOrder = useCallback(async () => {
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

  if (!patient) {
    return <Loader />;
  }

  return (
    <Container>
      <Panel>
        <Title order={2}>DoseSpot</Title>
        <Group mt="xl">
          <Button onClick={handleTestConnectivity}>Test connectivity...</Button>
          <Button onClick={handleSearchPatients}>Search patients...</Button>
          <Button onClick={handleSyncPatient}>Sync patient...</Button>
          <Button onClick={handleStartNewOrder}>Start new order...</Button>
        </Group>
      </Panel>
      {iframeUrl && (
        <Panel>
          <iframe id="dosespot-iframe" name="dosespot-iframe" src={iframeUrl} width={900} height={900}></iframe>
        </Panel>
      )}
    </Container>
  );
}
