// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Flex, Group, PasswordInput, Stack, Title } from '@mantine/core';
import { badRequest, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { Document } from '../Document/Document';
import { Form } from '../Form/Form';
import { Logo } from '../Logo/Logo';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { getErrorsForInput, getIssuesForExpression } from '../utils/outcomes';

export interface SetPasswordFormProps {
  readonly id: string;
  readonly secret: string;
  readonly onSuccess?: () => void;
  readonly onSignIn?: () => void;
}

export function SetPasswordForm(props: SetPasswordFormProps): JSX.Element {
  const { id, secret, onSuccess, onSignIn } = props;
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);
  const issues = getIssuesForExpression(outcome, undefined);

  return (
    <Document width={450}>
      <OperationOutcomeAlert issues={issues} />
      <Form
        onSubmit={(formData: Record<string, string>) => {
          if (formData.password !== formData.confirmPassword) {
            setOutcome(badRequest('Passwords do not match', 'confirmPassword'));
            return;
          }
          setOutcome(undefined);
          medplum
            .post('auth/setpassword', { id, secret, password: formData.password })
            .then(() => {
              setSuccess(true);
              onSuccess?.();
            })
            .catch((err) => setOutcome(normalizeOperationOutcome(err)));
        }}
      >
        <Flex direction="column" align="center" justify="center">
          <Logo size={32} />
          <Title>Set password</Title>
        </Flex>
        {!success && (
          <Stack>
            <PasswordInput
              name="password"
              label="New password"
              required={true}
              error={getErrorsForInput(outcome, 'password')}
            />
            <PasswordInput
              name="confirmPassword"
              label="Confirm new password"
              required={true}
              error={getErrorsForInput(outcome, 'confirmPassword')}
            />
            <Group justify="flex-end" mt="xl">
              <Button type="submit">Set password</Button>
            </Group>
          </Stack>
        )}
        {success && (
          <div data-testid="success">
            Password set. You can now&nbsp;
            {onSignIn ? (
              <Anchor component="button" type="button" onClick={onSignIn}>
                sign in
              </Anchor>
            ) : (
              'sign in'
            )}
            .
          </div>
        )}
      </Form>
    </Document>
  );
}
