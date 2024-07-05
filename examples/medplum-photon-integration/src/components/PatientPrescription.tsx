import { Button, Center, Paper } from '@mantine/core';

export function PatientPrescription(): JSX.Element {
  return (
    <Paper>
      <Center pt="lg" pb="lg">
        <Button>Sync Patient to Photon Health</Button>
      </Center>
    </Paper>
  );
}
