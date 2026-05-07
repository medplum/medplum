// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

export interface ReleaseUserToGlobalScopeWidgetProps {
  readonly userId: string;
  readonly onSuccess?: () => void;
}

export function ReleaseUserToGlobalScopeWidget(props: ReleaseUserToGlobalScopeWidgetProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, { open, close }] = useDisclosure(false);
  const [submitting, setSubmitting] = useState(false);
  const { userId, onSuccess } = props;

  function executeRelease(): void {
    setSubmitting(true);
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'scope', valueCode: 'global' }],
    };
    medplum
      .post(medplum.fhirUrl('User', userId, '$rescope'), params)
      .then(() => {
        showNotification({ color: 'green', message: 'User released to global scope' });
        close();
        onSuccess?.();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setSubmitting(false));
  }

  return (
    <>
      <Title order={3}>Release User to Global Scope</Title>
      <p>
        Remove this User from the Project&apos;s ownership so they become a <strong>global</strong> (server-scoped)
        User. This is a one-way action for a project admin — you will need the help of a super admin to re-attach the
        User to a Project afterwards.
      </p>
      <Button onClick={open}>Release User</Button>
      <Modal opened={opened} onClose={close} title="Confirm Release to Global Scope" centered size="auto">
        <Stack>
          <Text>
            You are about to <strong>release User/{userId}</strong> from this Project. After this change:
          </Text>
          <Text>
            • The User will become a <strong>global</strong> User, no longer owned by this Project.
          </Text>
          <Text>
            • This Project will <strong>lose administrative control</strong> over the User record itself.
          </Text>
          <Alert color="red" title="This change cannot be reversed by a project admin">
            <strong>You will need the help of a super admin to reverse this change.</strong> Once the User is released
            to global scope, only a super admin can re-assign the User back to this (or any) Project.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button color="red" onClick={executeRelease} loading={submitting}>
              Release to Global
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
