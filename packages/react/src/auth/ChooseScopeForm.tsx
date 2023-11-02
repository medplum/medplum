import { Button, Center, Checkbox, Group, Stack, Title } from '@mantine/core';
import { LoginAuthenticationResponse } from '@medplum/core';
import React from 'react';
import { Form } from '../Form/Form';
import { Logo } from '../Logo/Logo';
import { useMedplum } from '@medplum/react-hooks';

export interface ChooseScopeFormProps {
  login: string;
  scope: string | undefined;
  handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function ChooseScopeForm(props: ChooseScopeFormProps): JSX.Element {
  const medplum = useMedplum();
  return (
    <Form
      style={{ maxWidth: 400 }}
      onSubmit={(formData: Record<string, string>) => {
        medplum
          .post('auth/scope', {
            login: props.login,
            scope: Object.keys(formData).join(' '),
          })
          .then(props.handleAuthResponse)
          .catch(console.log);
      }}
    >
      <Stack>
        <Center sx={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title>Choose scope</Title>
        </Center>
        <Stack>
          {(props.scope ?? 'openid').split(' ').map((scopeName: string) => (
            <Checkbox key={scopeName} id={scopeName} name={scopeName} label={scopeName} defaultChecked />
          ))}
        </Stack>
        <Group position="right" mt="xl">
          <Button type="submit">Set scope</Button>
        </Group>
      </Stack>
    </Form>
  );
}
