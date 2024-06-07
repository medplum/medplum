import { Container, Group, Text, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Encounter, Patient } from '@medplum/fhirtypes';

interface EncounterHeaderProps {
  encounter: Encounter;
  patient?: Patient;
}

export function EncounterHeader({ encounter, patient }: EncounterHeaderProps): JSX.Element {
  const displayDate = getDisplayDate(encounter?.period?.start);

  return (
    <Group>
      <Container m="sm">
        <Text size="sm" c="dimmed">
          Encounter Type:
        </Text>
        <Title order={5}>{encounter.type?.[0].coding?.[0].display}</Title>
      </Container>
      <Container m="sm">
        <Text size="sm" c="dimmed">
          Patient:
        </Text>
        <Title order={5}>{patient ? getDisplayString(patient) : 'Unknown'}</Title>
      </Container>
      <Container m="sm">
        <Text size="sm" c="dimmed">
          Date:
        </Text>
        <Title order={5}>{displayDate}</Title>
      </Container>
    </Group>
  );
}

function getDisplayDate(isoStringDate?: string): string {
  const date = isoStringDate ? new Date(isoStringDate) : new Date();

  const year = date.getFullYear();
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day = ('0' + (date.getDate() + 1)).slice(-2);

  return `${year}-${month}-${day}`;
}
