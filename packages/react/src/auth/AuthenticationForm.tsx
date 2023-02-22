import { Anchor, Button, Center, Checkbox, Divider, Group, PasswordInput, Stack, TextInput } from '@mantine/core';
import {
  BaseLoginRequest,
  GoogleCredentialResponse,
  GoogleLoginRequest,
  LoginAuthenticationResponse,
  normalizeOperationOutcome,
} from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useCallback, useState } from 'react';
import { Form } from '../Form/Form';
import { getGoogleClientId, GoogleButton } from '../GoogleButton/GoogleButton';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { getErrorsForInput, getIssuesForExpression } from '../utils/outcomes';

export interface AuthenticationFormProps extends BaseLoginRequest {
  readonly disableGoogleAuth?: boolean;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly children?: React.ReactNode;
}

export function AuthenticationForm(props: AuthenticationFormProps): JSX.Element {
  const [email, setEmail] = useState<string>();

  if (!email) {
    return <EmailForm setEmail={setEmail} {...props} />;
  } else {
    return <PasswordForm email={email} {...props} />;
  }
}

export interface EmailFormProps extends BaseLoginRequest {
  readonly disableGoogleAuth?: boolean;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly setEmail: (email: string) => void;
  readonly children?: React.ReactNode;
}

export function EmailForm(props: EmailFormProps): JSX.Element {
  const { setEmail, onRegister, handleAuthResponse, children, ...baseLoginRequest } = props;
  const medplum = useMedplum();
  const googleClientId = !props.disableGoogleAuth && getGoogleClientId(props.googleClientId);

  const isExternalAuth = useCallback(
    async (authMethod: any): Promise<boolean> => {
      if (!authMethod.authorizeUrl) {
        return false;
      }

      const state = JSON.stringify({
        ...(await medplum.ensureCodeChallenge(baseLoginRequest)),
        domain: authMethod.domain,
      });
      const url = new URL(authMethod.authorizeUrl);
      url.searchParams.set('state', state);
      window.location.assign(url.toString());
      return true;
    },
    [medplum, baseLoginRequest]
  );

  const handleSubmit = useCallback(
    async (formData: Record<string, string>) => {
      const authMethod = await medplum.post('auth/method', { email: formData.email });
      if (!(await isExternalAuth(authMethod))) {
        setEmail(formData.email);
      }
    },
    [medplum, isExternalAuth, setEmail]
  );

  const handleGoogleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      const authResponse = await medplum.startGoogleLogin({
        ...baseLoginRequest,
        googleCredential: response.credential,
      } as GoogleLoginRequest);
      if (!(await isExternalAuth(authResponse))) {
        handleAuthResponse(authResponse);
      }
    },
    [medplum, baseLoginRequest, isExternalAuth, handleAuthResponse]
  );

  return (
    <Form style={{ maxWidth: 400 }} onSubmit={handleSubmit}>
      <Center sx={{ flexDirection: 'column' }}>{children}</Center>
      {googleClientId && (
        <>
          <Group position="center" p="xl" style={{ height: 70 }}>
            <GoogleButton googleClientId={googleClientId} handleGoogleCredential={handleGoogleCredential} />
          </Group>
          <Divider label="or" labelPosition="center" my="lg" />
        </>
      )}
      <TextInput
        name="email"
        type="email"
        label="Email"
        placeholder="name@domain.com"
        required={true}
        autoFocus={true}
      />
      <Group position="apart" mt="xl" spacing={0} noWrap>
        {onRegister && (
          <Anchor component="button" type="button" color="dimmed" onClick={onRegister} size="xs">
            Register
          </Anchor>
        )}
        <Button type="submit">Next</Button>
      </Group>
    </Form>
  );
}

export interface PasswordFormProps extends BaseLoginRequest {
  readonly email: string;
  readonly onForgotPassword?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly children?: React.ReactNode;
}

export function PasswordForm(props: PasswordFormProps): JSX.Element {
  const { onForgotPassword, handleAuthResponse, children, ...baseLoginRequest } = props;
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      medplum
        .startLogin({
          ...baseLoginRequest,
          password: formData.password,
          remember: formData.remember === 'on',
        })
        .then(handleAuthResponse)
        .catch((err) => setOutcome(normalizeOperationOutcome(err)));
    },
    [medplum, baseLoginRequest, handleAuthResponse]
  );

  return (
    <Form style={{ maxWidth: 400 }} onSubmit={handleSubmit}>
      <Center sx={{ flexDirection: 'column' }}>{children}</Center>
      <OperationOutcomeAlert issues={issues} />
      <Stack spacing="xl">
        <PasswordInput
          name="password"
          label="Password"
          autoComplete="off"
          required={true}
          error={getErrorsForInput(outcome, 'password')}
        />
      </Stack>
      <Group position="apart" mt="xl" spacing={0} noWrap>
        {onForgotPassword && (
          <Anchor component="button" type="button" color="dimmed" onClick={onForgotPassword} size="xs">
            Forgot password
          </Anchor>
        )}
        <Checkbox id="remember" name="remember" label="Remember me" size="xs" sx={{ lineHeight: 1 }} />
        <Button type="submit">Sign in</Button>
      </Group>
    </Form>
  );
}
