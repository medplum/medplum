import { Alert, Button, Center, Group, Stack, TextInput, Title } from '@mantine/core';
import { LoginAuthenticationResponse, normalizeErrorString } from '@medplum/core';
import { useMedplum } from '@medplum/react-hooks';
import { IconAlertCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { Form } from '../Form/Form';
import { Logo } from '../Logo/Logo';

export interface MfaFormProps {
  readonly login: string;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function MfaForm(props: MfaFormProps): JSX.Element {
  const medplum = useMedplum();
  const [errorMessage, setErrorMessage] = useState<string>();
  return (
    <Form
      onSubmit={(formData: Record<string, string>) => {
        setErrorMessage(undefined);
        medplum
          .post('auth/mfa/verify', {
            login: props.login,
            token: formData.token,
          })
          .then(props.handleAuthResponse)
          .catch((err) => setErrorMessage(normalizeErrorString(err)));
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
