// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Card, Stack, Text } from '@mantine/core';
import type { PatchOperation } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Encounter, Practitioner } from '@medplum/fhirtypes';
import { DateTimeInput, ResourceInput } from '@medplum/react';
import type { JSX } from 'react';

interface VisitDetailsPanelProps {
  practitioner?: Practitioner;
  encounter: Encounter;
  onEncounterChange: (ops: PatchOperation[]) => void;
}

export const VisitDetailsPanel = (props: VisitDetailsPanelProps): JSX.Element => {
  const { practitioner, encounter, onEncounterChange } = props;

  const handlePractitionerChange = async (practitioner: Practitioner | undefined): Promise<void> => {
    if (!encounter || !practitioner) {
      return;
    }

    onEncounterChange([{ op: 'add', path: '/participant', value: [{ individual: createReference(practitioner) }] }]);
  };

  const handleCheckinChange = async (checkin: string): Promise<void> => {
    if (!encounter || !checkin) {
      return;
    }

    onEncounterChange([{ op: 'add', path: '/period/start', value: checkin }]);
  };

  const handleCheckoutChange = async (checkout: string): Promise<void> => {
    if (!encounter || !checkout) {
      return;
    }

    onEncounterChange([{ op: 'add', path: '/period/end', value: checkout }]);
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
            placeholder="Search for practitioner"
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
