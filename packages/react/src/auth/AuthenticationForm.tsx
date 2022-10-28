import {
  Alert,
  Anchor,
  Button,
  Center,
  Checkbox,
  Divider,
  Group,
  PasswordInput,
  Stack,
  TextInput,
} from '@mantine/core';
import { GoogleCredentialResponse, LoginAuthenticationResponse } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { IconAlertCircle } from '@tabler/icons';
import React, { useState } from 'react';
import { Form } from '../Form';
import { getGoogleClientId, GoogleButton } from '../GoogleButton';
import { useMedplum } from '../MedplumProvider';
import { getErrorsForInput, getIssuesForExpression } from '../utils/outcomes';

export interface AuthenticationFormProps {
  readonly projectId?: string;
  readonly clientId?: string;
  readonly resourceType?: string;
  readonly scope?: string;
  readonly nonce?: string;
  readonly googleClientId?: string;
  readonly generatePkce?: boolean;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: string;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly children?: React.ReactNode;
}

export function AuthenticationForm(props: AuthenticationFormProps): JSX.Element {
  const medplum = useMedplum();
  const googleClientId = getGoogleClientId(props.googleClientId);
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  async function startPkce(): Promise<void> {
    if (props.generatePkce) {
      await medplum.startPkce();
    }
  }

  return (
    <Form
      style={{ maxWidth: 400 }}
      onSubmit={(formData: Record<string, string>) => {
        startPkce()
          .then(() =>
            medplum.startLogin({
              projectId: props.projectId,
              clientId: props.clientId,
              resourceType: props.resourceType,
              scope: props.scope,
              nonce: props.nonce,
              codeChallenge: props.codeChallenge,
              codeChallengeMethod: props.codeChallengeMethod,
              email: formData.email,
              password: formData.password,
              remember: formData.remember === 'on',
            })
          )
          .then(props.handleAuthResponse)
          .catch(setOutcome);
      }}
    >
      <Center sx={{ flexDirection: 'column' }}>{props.children}</Center>
      {issues && (
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          {issues.map((issue) => (
            <div data-testid="text-field-error" key={issue.details?.text}>
              {issue.details?.text}
            </div>
          ))}
        </Alert>
      )}
      {googleClientId && (
        <>
          <Group position="center" p="xl" style={{ height: 70 }}>
            <GoogleButton
              googleClientId={googleClientId}
              handleGoogleCredential={(response: GoogleCredentialResponse) => {
                startPkce()
                  .then(() =>
                    medplum.startGoogleLogin({
                      projectId: props.projectId,
                      clientId: props.clientId,
                      resourceType: props.resourceType,
                      scope: props.scope,
                      nonce: props.nonce,
                      codeChallenge: props.codeChallenge,
                      codeChallengeMethod: props.codeChallengeMethod,
                      googleClientId: response.clientId,
                      googleCredential: response.credential,
                    })
                  )
                  .then(props.handleAuthResponse)
                  .catch(setOutcome);
              }}
            />
          </Group>
          <Divider label="or" labelPosition="center" my="lg" />
        </>
      )}
      <Stack spacing="xl">
        <TextInput
          name="email"
          type="email"
          label="Email"
          placeholder="name@domain.com"
          required={true}
          autoFocus={true}
          error={getErrorsForInput(outcome, 'email')}
        />
        <PasswordInput
          name="password"
          type="password"
          label="Password"
          autoComplete="off"
          required={true}
          error={getErrorsForInput(outcome, 'password')}
        />
      </Stack>
      <Group position="apart" mt="xl" noWrap>
        {props.onForgotPassword && (
          <Anchor component="button" type="button" color="dimmed" onClick={props.onForgotPassword} size="xs">
            Forgot password
          </Anchor>
        )}
        {props.onRegister && (
          <Anchor component="button" type="button" color="dimmed" onClick={props.onRegister} size="xs">
            Register
          </Anchor>
        )}
        <Checkbox id="remember" name="remember" label="Remember me" size="xs" />
        <Button type="submit">Sign in</Button>
      </Group>
    </Form>
  );
}
