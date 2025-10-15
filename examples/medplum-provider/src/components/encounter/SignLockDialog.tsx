// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { createReference, formatHumanName } from '@medplum/core';
import type { HumanName, Practitioner, Reference } from '@medplum/fhirtypes';
import { ResourceAvatar, ResourceInput, useResource } from '@medplum/react';
import { IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import { showErrorNotification } from '../../utils/notifications';

interface SignLockDialogProps {
  practitioner: Reference<Practitioner> | Practitioner | undefined;
  onConfirm: (practitioner: Reference<Practitioner>) => void;
}

export const SignLockDialog = (props: SignLockDialogProps): JSX.Element => {
  const { onConfirm, practitioner } = props;
  const practitionerResource = useResource(practitioner);
  const [selectedPractitioner, setSelectedPractitioner] = useState<Reference<Practitioner> | undefined>(undefined);

  const practitionerName = practitionerResource?.name?.[0]
    ? formatHumanName(practitionerResource.name[0] as HumanName)
    : 'Unknown Provider';

  const handleConfirm = (): void => {
    if (!selectedPractitioner && !practitionerResource) {
      showErrorNotification('Please select a provider');
      return;
    }

    if (selectedPractitioner) {
      onConfirm(selectedPractitioner);
      return;
    }

    if (!practitionerResource) {
      showErrorNotification('Invalid provider selection');
      return;
    }

    onConfirm(createReference(practitionerResource));
  };

  return (
    <Stack gap="md">
      <Paper p="sm" withBorder radius="md">
        <Group gap="sm">
          <ResourceAvatar value={practitionerResource} radius="xl" size={36} />
          <Text size="sm" fw={500}>
            {practitionerName}
          </Text>
        </Group>
      </Paper>

      {practitionerResource && (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Signing On Behalf Of
          </Text>
          <ResourceInput<Practitioner>
            name="provider"
            resourceType="Practitioner"
            placeholder="Search for a provider..."
            onChange={(value) => {
              setSelectedPractitioner(value ? (createReference(value) as Reference<Practitioner>) : undefined);
            }}
          />
        </Stack>
      )}

      <Button fullWidth leftSection={<IconLock size={18} />} onClick={handleConfirm} mt="md">
        Sign & Lock Note
      </Button>
    </Stack>
  );
};
