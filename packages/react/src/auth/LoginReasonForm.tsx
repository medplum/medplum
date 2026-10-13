// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Flex, Text, Textarea, Title } from '@mantine/core';
import type { LoginAuthenticationResponse } from '@medplum/core';
import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { Logo } from '../Logo/Logo';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { getErrorsForInput, getIssuesForExpression } from '../utils/outcomes';

export interface LoginReasonFormProps {
  readonly login: string;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function LoginReasonForm(props: LoginReasonFormProps): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  return (
    <Form
      onSubmit={async (formData: Record<string, string>) => {
        try {
          props.handleAuthResponse(
            await medplum.post<LoginAuthenticationResponse>('auth/reason', {
              login: props.login,
              reason: formData.reason,
            })
          );
        } catch (err) {
          setOutcome(normalizeOperationOutcome(err));
        }
      }}
    >
      <Flex direction="column" align="center" justify="center">
        <Logo size={32} />
        <Title order={3} py="lg">
          Reason for access
        </Title>
        <Text size="sm" c="dimmed" ta="center" mb="md">
          This project requires a reason for each sign in.
        </Text>
      </Flex>
      <OperationOutcomeAlert issues={issues} mb="lg" />
      <Textarea
        name="reason"
        label="Reason"
        required
        autoFocus
        minRows={3}
        maxLength={1024}
        error={getErrorsForInput(outcome, 'reason')}
      />
      <SubmitButton fullWidth mt="md">
        Continue
      </SubmitButton>
    </Form>
  );
}
