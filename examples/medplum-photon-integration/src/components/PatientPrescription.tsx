import { Button, Group, Title } from '@mantine/core';
import { Document } from '@medplum/react';

export function PatientPrescription(): JSX.Element {
  return (
    <Document>
      <Group justify="space-between" mb="md">
        <Title order={3}>Prescription Management</Title>
        <Button>Sync Patient to Photon Health</Button>
      </Group>
      <photon-prescribe-workflow />
    </Document>
  );
}
