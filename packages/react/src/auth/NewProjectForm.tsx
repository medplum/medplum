import { Anchor, Button, Center, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { LoginAuthenticationResponse, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useState } from 'react';
import { Form } from '../Form/Form';
import { Logo } from '../Logo/Logo';
import { getErrorsForInput } from '../utils/outcomes';

export interface NewProjectFormProps {
  readonly login: string;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function NewProjectForm(props: NewProjectFormProps): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
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
      <Center style={{ flexDirection: 'column' }}>
        <Logo size={32} />
        <Title>Create project</Title>
      </Center>
      <Stack gap="xl">
        <TextInput
          name="projectName"
          label="Project Name"
          placeholder="My Project"
          required={true}
          autoFocus={true}
          error={getErrorsForInput(outcome, 'projectName')}
        />
        <Text c="dimmed" size="xs">
          By clicking submit you agree to the Medplum{' '}
          <Anchor href="https://www.medplum.com/privacy">Privacy&nbsp;Policy</Anchor>
          {' and '}
          <Anchor href="https://www.medplum.com/terms">Terms&nbsp;of&nbsp;Service</Anchor>.
        </Text>
      </Stack>
      <Group justify="flex-end" mt="xl" wrap="nowrap">
        <Button type="submit">Create project</Button>
      </Group>
    </Form>
  );
}
