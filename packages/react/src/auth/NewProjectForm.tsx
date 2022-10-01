import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { LoginAuthenticationResponse } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Form } from '../Form';
import { Logo } from '../Logo';
import { useMedplum } from '../MedplumProvider';
import { getErrorsForInput } from '../utils/outcomes';

export interface NewProjectFormProps {
  login: string;
  handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function NewProjectForm(props: NewProjectFormProps): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  return (
    <Form
      style={{ maxWidth: 400 }}
      onSubmit={async (formData: Record<string, string>) => {
        try {
          props.handleAuthResponse(
            await medplum.startNewProject({
              login: props.login,
              projectName: formData.projectName,
            })
          );
        } catch (err) {
          setOutcome(err as OperationOutcome);
        }
      }}
    >
      <div className="medplum-center">
        <Logo size={32} />
        <h1>Create project</h1>
      </div>
      <Stack spacing="xl">
        <TextInput
          name="projectName"
          label="Project Name"
          placeholder="My Project"
          required={true}
          autoFocus={true}
          error={getErrorsForInput(outcome, 'firstName')}
        />
        <Text color="dimmed" size="xs">
          By clicking submit you agree to the Medplum <a href="https://www.medplum.com/privacy">Privacy&nbsp;Policy</a>
          {' and '}
          <a href="https://www.medplum.com/terms">Terms&nbsp;of&nbsp;Service</a>.
        </Text>
      </Stack>
      <Group position="right" mt="xl" noWrap>
        <Button type="submit">Create project</Button>
      </Group>
    </Form>
  );
}
