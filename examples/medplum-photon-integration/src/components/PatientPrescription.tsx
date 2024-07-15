import { Button, Group, Title } from '@mantine/core';
import { Document, useMedplum } from '@medplum/react';

export function PatientPrescription(): JSX.Element {
  const medplum = useMedplum();
  async function testConnection(): Promise<void> {
    try {
      const result = await medplum.executeBot(
        {
          system: 'https://neutron.health/bots',
          value: 'test-auth-bot',
        },
        {},
        'application/json'
      );

      console.log(result);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <Document>
      <Group justify="space-between" mb="md">
        <Title order={3}>Prescription Management</Title>
        <Button onClick={testConnection}>Test Connection</Button>
        <Button>Sync Patient to Photon Health</Button>
      </Group>
      <photon-prescribe-workflow />
    </Document>
  );
}
