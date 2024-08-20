import { Button, Center, Group, Stack, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';

interface PatientPrescriptionProps {
  patient: Patient;
}

export function PatientPrescription({ patient }: PatientPrescriptionProps): JSX.Element {
  const medplum = useMedplum();

  const patientSynced = patient.identifier?.find((id) => id.system === 'https://neutron.health/patients');
  const patientPhotonId = patientSynced?.value;
  const [syncDisabled, setSyncDisabled] = useState<boolean>(!!patientSynced);

  async function testConnection(): Promise<void> {
    try {
      const result = await medplum.executeBot(
        {
          system: 'https://neutron.health/bots',
          value: 'test-auth',
        },
        {},
        'application/json'
      );

      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Connected to Photon Health',
      });
      console.log(result);
    } catch (err) {
      notifications.show({
        icon: <IconCircleOff />,
        color: 'red',
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  async function syncPatient(): Promise<void> {
    try {
      await medplum.executeBot(
        {
          system: 'https://neutron.health/bots',
          value: 'sync-patient',
        },
        {
          ...patient,
        },
        'application/fhir+json'
      );
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Patient synced',
      });
      setSyncDisabled(true);
    } catch (err) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  return (
    <Document>
      <Group justify="space-between" mb="md">
        <Title order={3}>Prescription Management</Title>
        <Button onClick={testConnection}>Test Connection</Button>
      </Group>
      {syncDisabled ? (
        <div>
          <photon-prescribe-workflow
            patient-id={patientPhotonId}
            enable-order="true"
            hide-patient-card="true"
            enable-med-history="true"
          />
        </div>
      ) : (
        <Center>
          <Stack>
            <p>This patient has no record in Photon Health. Click below to sync them to Photon.</p>
            <Button m="auto" w="fit-content" onClick={syncPatient}>
              Sync Patient to Photon Health
            </Button>
          </Stack>
        </Center>
      )}
    </Document>
  );
}
