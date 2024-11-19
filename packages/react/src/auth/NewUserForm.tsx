import { Anchor, Button, Center, Checkbox, Divider, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { GoogleCredentialResponse, LoginAuthenticationResponse, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { ReactNode, useEffect, useState } from 'react';
import { Form } from '../Form/Form';
import { GoogleButton } from '../GoogleButton/GoogleButton';
import { getGoogleClientId } from '../GoogleButton/GoogleButton.utils';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { getErrorsForInput, getIssuesForExpression } from '../utils/outcomes';
import { getRecaptcha, initRecaptcha } from '../utils/recaptcha';

export interface NewUserFormProps {
  readonly projectId: string;
  readonly clientId?: string;
  readonly googleClientId?: string;
  readonly recaptchaSiteKey?: string;
  readonly children?: ReactNode;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function NewUserForm(props: NewUserFormProps): JSX.Element {
  const googleClientId = getGoogleClientId(props.googleClientId);
  const recaptchaSiteKey = props.recaptchaSiteKey;
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  useEffect(() => {
    if (recaptchaSiteKey) {
      initRecaptcha(recaptchaSiteKey);
    }
  }, [recaptchaSiteKey]);

  return (
    <Form
      onSubmit={async (formData: Record<string, string>) => {
        try {
          let recaptchaToken = '';
          if (recaptchaSiteKey) {
            recaptchaToken = await getRecaptcha(recaptchaSiteKey);
          }
          props.handleAuthResponse(
            await medplum.startNewUser({
              projectId: props.projectId,
              clientId: props.clientId,
              firstName: formData.firstName,
              lastName: formData.lastName,
              email: formData.email,
              password: formData.password,
              remember: formData.remember === 'true',
              recaptchaSiteKey,
              recaptchaToken,
            })
          );
        } catch (err) {
          setOutcome(normalizeOperationOutcome(err));
        }
      }}
    >
      <Center style={{ flexDirection: 'column' }}>{props.children}</Center>
      <OperationOutcomeAlert issues={issues} />
      {googleClientId && (
        <>
          <Group justify="center" p="xl" style={{ height: 70 }}>
            <GoogleButton
              googleClientId={googleClientId}
              handleGoogleCredential={async (response: GoogleCredentialResponse) => {
                try {
                  props.handleAuthResponse(
                    await medplum.startGoogleLogin({
                      googleClientId: response.clientId,
                      googleCredential: response.credential,
                      projectId: props.projectId,
                      createUser: true,
                    })
                  );
                } catch (err) {
                  setOutcome(normalizeOperationOutcome(err));
                }
              }}
            />
          </Group>
          <Divider label="or" labelPosition="center" my="lg" />
        </>
      )}
      <Stack gap="xl">
        <TextInput
          name="firstName"
          type="text"
          label="Nombre"
          placeholder="Ingrese su primer nombre"
          required={true}
          autoFocus={true}
          error={getErrorsForInput(outcome, 'firstName')}
        />
        <TextInput
          name="lastName"
          type="text"
          label="Apellido"
          placeholder="Ingrese su Apellido"
          required={true}
          error={getErrorsForInput(outcome, 'lastName')}
        />
        <TextInput
          name="email"
          type="email"
          label="Email"
          placeholder="nombre@dominio.com"
          required={true}
          error={getErrorsForInput(outcome, 'email')}
        />
        <PasswordInput
          name="password"
          label="Password"
          autoComplete="off"
          required={true}
          error={getErrorsForInput(outcome, 'password')}
        />
        <Text c="dimmed" size="xs">
          Haciendo click acepta EPA{' '}
          <Anchor href="https://www.epa-bienestar.com.ar/politica_de_privacidad.html">Privacidad</Anchor>
          {' and '}
          <Anchor href="https://www.epa-bienestar.com.ar/condiciones_del_servicio.html">Condiciones</Anchor>.
        </Text>
        <Text c="dimmed" size="xs">
          Sitio protegido por reCAPTCHA and the Google{' '}
          <Anchor href="https://policies.google.com/privacy">Privacy&nbsp;Policy</Anchor>
          {' and '}
          <Anchor href="https://policies.google.com/terms">Terms&nbsp;of&nbsp;Service</Anchor> apply.
        </Text>
      </Stack>
      <Group justify="space-between" mt="xl" wrap="nowrap">
        <Checkbox name="remember" label="Recordarme" size="xs" />
        <Button type="submit">Crear una cuenta nueva</Button>
      </Group>
    </Form>
  );
}
