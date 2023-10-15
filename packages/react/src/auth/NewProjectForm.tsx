import { Anchor, Button, Center, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { LoginAuthenticationResponse, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Form } from '../Form/Form';
import { Logo } from '../Logo/Logo';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';
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
          setOutcome(normalizeOperationOutcome(err));
        }
      }}
    >
      <Center sx={{ flexDirection: 'column' }}>
        <Logo size={32} />
        <Title>Create project</Title>
      </Center>
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
          By clicking submit you agree to the Medplum{' '}
          <Anchor href="https://www.medplum.com/privacy">Privacy&nbsp;Policy</Anchor>
          {' and '}
          <Anchor href="https://www.medplum.com/terms">Terms&nbsp;of&nbsp;Service</Anchor>.
        </Text>
      </Stack>
      <Group position="right" mt="xl" noWrap>
        <Button type="submit">Create project</Button>
      </Group>
    </Form>
  );
}
