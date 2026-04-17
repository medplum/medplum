// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Flex, Group, PasswordInput, Stack, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { Document } from '../Document/Document';
import { Form } from '../Form/Form';
import { Logo } from '../Logo/Logo';
import { getErrorsForInput } from '../utils/outcomes';

export interface ChangePasswordFormProps {
  readonly onSuccess?: () => void;
}

export function ChangePasswordForm(props: ChangePasswordFormProps): JSX.Element {
  const { onSuccess } = props;
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  return (
    <Document width={450}>
      <Form
        onSubmit={(formData: Record<string, string>) => {
          setOutcome(undefined);
          medplum
            .post('auth/changepassword', formData)
            .then(() => {
              setSuccess(true);
              onSuccess?.();
            })
            .catch((err) => setOutcome(normalizeOperationOutcome(err)));
        }}
      >
        <Flex direction="column" align="center" justify="center">
          <Logo size={32} />
          <Title>Change password</Title>
        </Flex>
        {!success && (
          <Stack gap="xl" mt="xl">
            <PasswordInput
              name="oldPassword"
              label="Old password"
              required={true}
              autoFocus={true}
              error={getErrorsForInput(outcome, 'oldPassword')}
            />
            <PasswordInput
              name="newPassword"
              label="New password"
              required={true}
              error={getErrorsForInput(outcome, 'newPassword')}
            />
            <PasswordInput
              name="confirmPassword"
              label="Confirm new password"
              required={true}
              error={getErrorsForInput(outcome, 'confirmPassword')}
            />
            <Group justify="flex-end" mt="xl" wrap="nowrap">
              <Button type="submit">Change password</Button>
            </Group>
          </Stack>
        )}
        {success && <div data-testid="success">Password changed successfully</div>}
      </Form>
    </Document>
  );
}
