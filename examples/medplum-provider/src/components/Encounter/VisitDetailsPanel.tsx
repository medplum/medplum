import { Card, Stack, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Encounter, Practitioner } from '@medplum/fhirtypes';
import { DateTimeInput, ResourceInput } from '@medplum/react';
import { JSX } from 'react';

interface VisitDetailsPanelProps {
  practitioner?: Practitioner;
  encounter: Encounter;
  onEncounterChange: (encounter: Encounter) => void;
}

export const VisitDetailsPanel = (props: VisitDetailsPanelProps): JSX.Element => {
  const { practitioner, encounter, onEncounterChange } = props;

  const handlePractitionerChange = async (practitioner: Practitioner | undefined): Promise<void> => {
    if (!encounter || !practitioner) {
      return;
    }

    const updatedEncounter = {
      ...encounter,
      participant: [
        {
          individual: {
            reference: getReferenceString(practitioner),
          },
        },
      ],
    };

    onEncounterChange(updatedEncounter);
  };

  const handleCheckinChange = async (checkin: string): Promise<void> => {
    if (!encounter || !checkin) {
      return;
    }

    const updatedEncounter = {
      ...encounter,
      period: {
        start: checkin,
      },
    };

    onEncounterChange(updatedEncounter);
  };

  const handleCheckoutChange = async (checkout: string): Promise<void> => {
    if (!encounter || !checkout) {
      return;
    }

    const updatedEncounter = {
      ...encounter,
      period: {
        end: checkout,
      },
    };

    onEncounterChange(updatedEncounter);
  };

  return (
    <Stack gap={0}>
      <Text fw={600} size="lg" mb="md">
        Visit Details
      </Text>
      <Card withBorder shadow="sm" p="md">
        <Stack gap="md">
          <ResourceInput
            resourceType="Practitioner"
            name="practitioner"
            label="Practitioner"
            defaultValue={practitioner}
            onChange={handlePractitionerChange}
          />

          <DateTimeInput
            name="checkin"
            label="Check in"
            defaultValue={encounter.period?.start}
            onChange={handleCheckinChange}
          />

          <DateTimeInput
            name="checkout"
            label="Check out"
            defaultValue={encounter.period?.end}
            onChange={handleCheckoutChange}
          />
        </Stack>
      </Card>
    </Stack>
  );
};
