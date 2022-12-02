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
import {
  BaseLoginRequest,
  GoogleCredentialResponse,
  GoogleLoginRequest,
  LoginAuthenticationResponse,
} from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { IconAlertCircle } from '@tabler/icons';
import React, { useState } from 'react';
import { Form } from '../Form/Form';
import { getGoogleClientId, GoogleButton } from '../GoogleButton/GoogleButton';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { getErrorsForInput, getIssuesForExpression } from '../utils/outcomes';

export interface AuthenticationFormProps extends BaseLoginRequest {
  readonly generatePkce?: boolean;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly children?: React.ReactNode;
}

export function AuthenticationForm(props: AuthenticationFormProps): JSX.Element {
  const { generatePkce, onForgotPassword, onRegister, handleAuthResponse, children, ...baseLoginRequest } = props;
  const medplum = useMedplum();
  const googleClientId = getGoogleClientId(props.googleClientId);
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  async function startPkce(): Promise<void> {
    if (generatePkce) {
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
              ...baseLoginRequest,
              email: formData.email,
              password: formData.password,
              remember: formData.remember === 'on',
            })
          )
          .then(handleAuthResponse)
          .catch(setOutcome);
      }}
    >
      <Center sx={{ flexDirection: 'column' }}>{children}</Center>
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
                      ...baseLoginRequest,
                      googleCredential: response.credential,
                    } as GoogleLoginRequest)
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
      <Group position="apart" mt="xl" spacing={0} noWrap>
        {onForgotPassword && (
          <Anchor component="button" type="button" color="dimmed" onClick={onForgotPassword} size="xs">
            Forgot password
          </Anchor>
        )}
        {onRegister && (
          <Anchor component="button" type="button" color="dimmed" onClick={onRegister} size="xs">
            Register
          </Anchor>
        )}
        <Checkbox id="remember" name="remember" label="Remember me" size="xs" sx={{ lineHeight: 1 }} />
        <Button type="submit">Sign in</Button>
      </Group>
    </Form>
  );
}
