// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Flex, Stack, Text, TextInput, Title } from '@mantine/core';
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

export interface NewProjectFormProps {
  readonly login: string;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function NewProjectForm(props: NewProjectFormProps): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const issues = getIssuesForExpression(outcome, undefined);

  return (
    <Form
      onSubmit={async (formData: Record<string, string>) => {
        try {
          props.handleAuthResponse(
            await medplum.startNewProject({
              login: props.login,
              projectName: formData.projectName,
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
          Create a new project
        </Title>
      </Flex>
      <OperationOutcomeAlert issues={issues} mb="lg" />
      <Stack gap="sm">
        <TextInput
          name="projectName"
          label="Project Name"
          placeholder="My Project"
          required={true}
          autoFocus={true}
          error={getErrorsForInput(outcome, 'projectName')}
        />
      </Stack>
      <Stack gap="xs" mt="md">
        <SubmitButton fullWidth>Create Project</SubmitButton>
        <Text c="dimmed" size="xs" pt="lg" ta="center">
          By clicking "Create Project" you agree to the Medplum{' '}
          <Anchor href="https://www.medplum.com/privacy">Privacy&nbsp;Policy</Anchor>
          {' and '}
          <Anchor href="https://www.medplum.com/terms">Terms&nbsp;of&nbsp;Service</Anchor>.
        </Text>
      </Stack>
    </Form>
  );
}
