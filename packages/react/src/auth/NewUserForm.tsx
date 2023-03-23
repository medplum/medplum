import { Anchor, Button, Center, Checkbox, Divider, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { GoogleCredentialResponse, LoginAuthenticationResponse } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { Form } from '../Form/Form';
import { getGoogleClientId, GoogleButton } from '../GoogleButton/GoogleButton';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { getErrorsForInput, getIssuesForExpression } from '../utils/outcomes';
import { getRecaptcha, initRecaptcha } from '../utils/recaptcha';

export interface NewUserFormProps {
  readonly projectId: string;
  readonly googleClientId?: string;
  readonly recaptchaSiteKey: string;
  readonly children?: React.ReactNode;
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
      style={{ maxWidth: 400 }}
      onSubmit={async (formData: Record<string, string>) => {
        try {
          let recaptchaToken = '';
          if (recaptchaSiteKey) {
            recaptchaToken = await getRecaptcha(recaptchaSiteKey);
          }
          props.handleAuthResponse(
            await medplum.startNewUser({
              projectId: props.projectId,
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
          setOutcome(err as OperationOutcome);
        }
      }}
    >
      <Center sx={{ flexDirection: 'column' }}>{props.children}</Center>
      <OperationOutcomeAlert issues={issues} />
      {googleClientId && (
        <>
          <Group position="center" p="xl" style={{ height: 70 }}>
            <GoogleButton
              googleClientId={googleClientId}
              handleGoogleCredential={async (response: GoogleCredentialResponse) => {
                try {
                  props.handleAuthResponse(
                    await medplum.startGoogleLogin({
                      googleClientId: response.clientId,
                      googleCredential: response.credential,
                      createUser: true,
                    })
                  );
                } catch (err) {
                  setOutcome(err as OperationOutcome);
                }
              }}
            />
          </Group>
          <Divider label="or" labelPosition="center" my="lg" />
        </>
      )}
      <Stack spacing="xl">
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
        <Text color="dimmed" size="xs">
          By clicking submit you agree to the Medplum{' '}
          <Anchor href="https://www.medplum.com/privacy">Privacy&nbsp;Policy</Anchor>
          {' and '}
          <Anchor href="https://www.medplum.com/terms">Terms&nbsp;of&nbsp;Service</Anchor>.
        </Text>
        <Text color="dimmed" size="xs">
          This site is protected by reCAPTCHA and the Google{' '}
          <Anchor href="https://policies.google.com/privacy">Privacy&nbsp;Policy</Anchor>
          {' and '}
          <Anchor href="https://policies.google.com/terms">Terms&nbsp;of&nbsp;Service</Anchor> apply.
        </Text>
      </Stack>
      <Group position="apart" mt="xl" noWrap>
        <Checkbox name="remember" label="Remember me" size="xs" />
        <Button type="submit">Create account</Button>
      </Group>
    </Form>
  );
}
