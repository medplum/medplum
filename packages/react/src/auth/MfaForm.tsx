import { Alert, Button, Center, Group, Stack, TextInput, Title } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { Form } from '../Form/Form';
import { Logo } from '../Logo/Logo';

export type MfaFormFields = 'token';

export interface MfaFormProps {
  readonly onSubmit: (formData: Record<MfaFormFields, string>) => Promise<void>;
}

export function MfaForm(props: MfaFormProps): JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string>();
  return (
    <Form
      onSubmit={(formData: Record<MfaFormFields, string>) => {
        setErrorMessage(undefined);
        props.onSubmit(formData).catch((err) => setErrorMessage(normalizeErrorString(err)));
      }}
    >
      <Stack>
        <Center style={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title>Enter MFA code</Title>
        </Center>
        {errorMessage && (
          <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
            {errorMessage}
          </Alert>
        )}
        <Stack>
          <TextInput name="token" label="MFA code" required autoFocus />
        </Stack>
        <Group justify="flex-end" mt="xl">
          <Button type="submit">Submit code</Button>
        </Group>
      </Stack>
    </Form>
  );
}
