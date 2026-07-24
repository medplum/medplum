// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Paper, Text } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Practitioner, Reference } from '@medplum/fhirtypes';
import { ModalActionsFooter, ModalContentLayout, ResourceAvatar, useMedplumProfile } from '@medplum/react';
import { IconLock, IconSignature } from '@tabler/icons-react';
import type { JSX } from 'react';
import { showErrorNotification } from '../../utils/notifications';

interface SignLockDialogProps {
  onSign: (practitioner: Reference<Practitioner>, lock: boolean) => void;
}

export const SignLockDialog = (props: SignLockDialogProps): JSX.Element => {
  const { onSign } = props;
  const author = useMedplumProfile();
  const authorReference = author ? (createReference(author) as Reference<Practitioner>) : undefined;

  const handleSign = (lock: boolean): void => {
    if (!authorReference) {
      showErrorNotification('No author information found');
      return;
    }

    onSign(authorReference, lock);
  };

  return (
    <ModalContentLayout
      footer={
        <ModalActionsFooter>
          <Button fullWidth leftSection={<IconLock size={18} />} onClick={() => handleSign(true)}>
            Sign & Lock Note
          </Button>
          <Button
            variant="outline"
            fullWidth
            leftSection={<IconSignature size={18} />}
            onClick={() => handleSign(false)}
          >
            Just Sign
          </Button>
        </ModalActionsFooter>
      }
    >
      <Paper p="sm" withBorder radius="md">
        <Group gap="sm">
          <ResourceAvatar value={authorReference} radius="xl" size={36} />
          <Text size="sm" fw={500}>
            {authorReference?.display}
          </Text>
        </Group>
      </Paper>
    </ModalContentLayout>
  );
};
