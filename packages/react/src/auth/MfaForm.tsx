import { Alert, Button, Center, Group, Stack, TextInput, Title } from '@mantine/core';
import { LoginAuthenticationResponse, normalizeErrorString } from '@medplum/core';
import { IconAlertCircle } from '@tabler/icons-react';
import React, { useState } from 'react';
import { Form } from '../Form/Form';
import { Logo } from '../Logo/Logo';
import { useMedplum } from '../MedplumProvider/MedplumProvider';

export interface MfaFormProps {
  login: string;
  handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function MfaForm(props: MfaFormProps): JSX.Element {
  const medplum = useMedplum();
  const [errorMessage, setErrorMessage] = useState<string>();
  return (
    <Form
      style={{ maxWidth: 400 }}
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
        <Center sx={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title>Enter MFA code</Title>
        </Center>
        {errorMessage && (
          <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
            {errorMessage}
          </Alert>
        )}
        <Stack>
          <TextInput name="token" label="MFA code" required />
        </Stack>
        <Group position="right" mt="xl">
          <Button type="submit">Submit code</Button>
        </Group>
      </Stack>
    </Form>
  );
}
