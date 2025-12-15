// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Box, Center, Checkbox, Divider, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import type { GoogleCredentialResponse, LoginAuthenticationResponse } from '@medplum/core';
import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
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
  readonly onSignIn?: () => void;
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
        setOutcome(undefined);
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
      <OperationOutcomeAlert issues={issues} mb="lg" />
      {googleClientId && (
        <>
          <Box style={{ minHeight: 40 }}>
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
          </Box>
          <Divider label="or" labelPosition="center" my="lg" />
        </>
      )}
      <Stack gap="sm">
        <TextInput
          name="firstName"
          type="text"
          label="First name"
          placeholder="First name"
          required={true}
          autoFocus={true}
          error={getErrorsForInput(outcome, 'firstName')}
        />
        <TextInput
          name="lastName"
          type="text"
          label="Last name"
          placeholder="Last name"
          required={true}
          error={getErrorsForInput(outcome, 'lastName')}
        />
        <TextInput
          name="email"
          type="email"
          label="Email"
          placeholder="name@domain.com"
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
        <SubmitButton fullWidth>Register Account</SubmitButton>
        <Text c="dimmed" size="xs" pt="lg" ta="center">
          By clicking "Register Account" you agree to the Medplum{' '}
          <Anchor href="https://www.medplum.com/privacy">Privacy&nbsp;Policy</Anchor>
          {' and '}
          <Anchor href="https://www.medplum.com/terms">Terms&nbsp;of&nbsp;Service</Anchor>.
        </Text>
        <Text c="dimmed" size="xs" ta="center">
          This site is protected by reCAPTCHA and the Google{' '}
          <Anchor href="https://policies.google.com/privacy">Privacy&nbsp;Policy</Anchor>
          {' and '}
          <Anchor href="https://policies.google.com/terms">Terms&nbsp;of&nbsp;Service</Anchor> apply.
        </Text>
        {props.onSignIn && (
          <Text size="sm" c="dimmed" ta="center" pt="md">
            Already have an account?{' '}
            <Anchor
              component="button"
              type="button"
              onClick={props.onSignIn}
              size="sm"
              data-dashlane-ignore="true"
              data-lp-ignore="true"
              data-no-autofill="true"
              data-form-type="navigation"
            >
              Sign In to create a new project
            </Anchor>
          </Text>
        )}
      </Stack>
    </Form>
  );
}
