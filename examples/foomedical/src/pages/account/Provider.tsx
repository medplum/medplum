import { Box, Button, Stack, Title } from '@mantine/core';
import { Patient } from '@medplum/fhirtypes';
import { ResourceAvatar, ResourceName, useMedplum } from '@medplum/react';
import { InfoSection } from '../../components/InfoSection';

export function Provider(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;

  if (patient.generalPractitioner && patient.generalPractitioner.length > 0) {
    return (
      <Box p="xl">
        <Title mb="lg">My Provider</Title>
        <InfoSection title="My Primary Care Provider">
          <Box p="xl">
            <Stack align="center">
              <ResourceAvatar size={200} radius={100} value={patient.generalPractitioner[0]} />
              <Title order={2}>
                <ResourceName value={patient.generalPractitioner[0]} />
              </Title>
              <Button size="lg">Choose a Primary Care Provider</Button>
            </Stack>
          </Box>
        </InfoSection>
      </Box>
    );
  }

  return (
    <Box p="xl">
      <Title mb="lg">Choose a provider</Title>
      <InfoSection title="My Primary Care Provider">TODO</InfoSection>
    </Box>
  );
}
