// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Anchor,
  Box,
  Center,
  Checkbox,
  Divider,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import type {
  BaseLoginRequest,
  GoogleCredentialResponse,
  GoogleLoginRequest,
  LoginAuthenticationResponse,
} from '@medplum/core';
import { locationUtils, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconPencil } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { GoogleButton } from '../GoogleButton/GoogleButton';
import { getGoogleClientId } from '../GoogleButton/GoogleButton.utils';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { getErrorsForInput, getIssuesForExpression } from '../utils/outcomes';

export interface AuthenticationFormProps extends BaseLoginRequest {
  readonly disableEmailAuth?: boolean;
  readonly disableGoogleAuth?: boolean;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly children?: ReactNode;
}

export function AuthenticationForm(props: AuthenticationFormProps): JSX.Element {
  const [email, setEmail] = useState<string>();

  if (!email) {
    return <EmailForm setEmail={setEmail} {...props} />;
  } else {
    return <PasswordForm email={email} resetEmail={() => setEmail(undefined)} {...props} />;
  }
}

export interface EmailFormProps extends BaseLoginRequest {
  readonly disableEmailAuth?: boolean;
  readonly disableGoogleAuth?: boolean;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly setEmail: (email: string) => void;
  readonly children?: ReactNode;
}

export function EmailForm(props: EmailFormProps): JSX.Element {
  const { setEmail, onRegister, handleAuthResponse, children, disableEmailAuth, ...baseLoginRequest } = props;
  const medplum = useMedplum();
  const googleClientId = !props.disableGoogleAuth && getGoogleClientId(props.googleClientId);
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

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
      locationUtils.assign(url.toString());
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
      try {
        const authResponse = await medplum.startGoogleLogin({
          ...baseLoginRequest,
          googleCredential: response.credential,
        } as GoogleLoginRequest);
        if (!(await isExternalAuth(authResponse))) {
          handleAuthResponse(authResponse);
        }
      } catch (err) {
        setOutcome(normalizeOperationOutcome(err));
      }
    },
    [medplum, baseLoginRequest, isExternalAuth, handleAuthResponse]
  );

  return (
    <Form onSubmit={handleSubmit}>
      <Center style={{ flexDirection: 'column' }}>{children}</Center>
      <OperationOutcomeAlert issues={issues} mb="lg" />
      {googleClientId && (
        <>
          <Box style={{ minHeight: 40 }}>
            <GoogleButton googleClientId={googleClientId} handleGoogleCredential={handleGoogleCredential} />
          </Box>
          {!disableEmailAuth && <Divider label="or" labelPosition="center" my="lg" />}
        </>
      )}
      {!disableEmailAuth && (
        <TextInput
          name="email"
          type="email"
          label="Email"
          mb="md"
          placeholder="name@domain.com"
          required={true}
          autoFocus={true}
          error={getErrorsForInput(outcome, 'email')}
          data-testid="auth.email"
        />
      )}
      <Stack gap="xs">
        {!disableEmailAuth && <SubmitButton fullWidth>Continue</SubmitButton>}
        {onRegister && (
          <Text
            size="sm"
            mt="lg"
            c="dimmed"
            style={{ textAlign: 'center' }}
            data-dashlane-ignore="true"
            data-lp-ignore="true"
            data-no-autofill="true"
            data-form-type="navigation"
          >
            Don’t have an account? <Anchor onClick={onRegister}>Sign Up</Anchor>
          </Text>
        )}
      </Stack>
    </Form>
  );
}

export interface PasswordFormProps extends BaseLoginRequest {
  readonly email: string;
  readonly onForgotPassword?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly resetEmail: () => void;
  readonly children?: ReactNode;
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
        .catch((err: unknown) => setOutcome(normalizeOperationOutcome(err)));
    },
    [medplum, baseLoginRequest, handleAuthResponse]
  );

  return (
    <Form onSubmit={handleSubmit}>
      <Center style={{ flexDirection: 'column' }}>{children}</Center>
      <OperationOutcomeAlert issues={issues} />
      <Stack gap="sm">
        <TextInput
          label="Email"
          value={props.email}
          disabled
          rightSectionWidth={36}
          rightSection={
            <ActionIcon variant="subtle" color="gray" onClick={props.resetEmail} aria-label="Change email">
              <IconPencil size="1rem" stroke={1.5} />
            </ActionIcon>
          }
        />
        <PasswordInput
          name="password"
          label="Password"
          autoComplete="off"
          required={true}
          autoFocus={true}
          error={getErrorsForInput(outcome, 'password')}
          data-testid="auth.password"
        />
      </Stack>
      <Stack gap="xs">
        <Checkbox
          id="remember"
          name="remember"
          label="Remember me"
          size="xs"
          style={{ lineHeight: 1 }}
          pt="md"
          pb="xs"
        />
        <SubmitButton>Sign in</SubmitButton>
        {onForgotPassword && (
          <Text
            size="sm"
            mt="lg"
            c="dimmed"
            style={{ textAlign: 'center' }}
            data-dashlane-ignore="true"
            data-lp-ignore="true"
            data-no-autofill="true"
            data-form-type="navigation"
          >
            <Anchor onClick={onForgotPassword}>Reset Password</Anchor>
          </Text>
        )}
      </Stack>
    </Form>
  );
}
