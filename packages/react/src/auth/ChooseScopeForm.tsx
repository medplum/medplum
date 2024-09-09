import { Button, Center, Checkbox, Group, Stack, Title } from '@mantine/core';
import { LoginAuthenticationResponse } from '@medplum/core';
import { useMedplum } from '@medplum/react-hooks';
import { Form } from '../Form/Form';
import { Logo } from '../Logo/Logo';

export interface ChooseScopeFormProps {
  readonly login: string;
  readonly scope: string | undefined;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function ChooseScopeForm(props: ChooseScopeFormProps): JSX.Element {
  const medplum = useMedplum();
  return (
    <Form
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
        <Center style={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title>Choose scope</Title>
        </Center>
        <Stack>
          {(props.scope ?? 'openid').split(' ').map((scopeName: string) => (
            <Checkbox key={scopeName} id={scopeName} name={scopeName} label={scopeName} defaultChecked />
          ))}
        </Stack>
        <Group justify="flex-end" mt="xl">
          <Button type="submit">Set scope</Button>
        </Group>
      </Stack>
    </Form>
  );
}
