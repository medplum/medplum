// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Center, Stack, Text, TextInput, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import {
  Document,
  Form,
  getErrorsForInput,
  getIssuesForExpression,
  getRecaptcha,
  initRecaptcha,
  Logo,
  OperationOutcomeAlert,
  SubmitButton,
  useMedplum,
} from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getConfig, isRegisterEnabled } from './config';

export function ResetPasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);
  const recaptchaSiteKey = getConfig().recaptchaSiteKey;
  const projectId = searchParams.get('project') || undefined;

  useEffect(() => {
    if (recaptchaSiteKey) {
      initRecaptcha(recaptchaSiteKey);
    }
  }, [recaptchaSiteKey]);

  return (
    <Document width={400} px="xl" py="xl" bdrs="md">
      <Form
        onSubmit={async (formData: Record<string, string>) => {
          setOutcome(undefined);
          try {
            let recaptchaToken = '';
            if (recaptchaSiteKey) {
              recaptchaToken = await getRecaptcha(recaptchaSiteKey);
            }

            await medplum.post('auth/resetpassword', {
              ...formData,
              projectId,
              recaptchaToken,
            });
            setSuccess(true);
          } catch (err) {
            setOutcome(normalizeOperationOutcome(err));
          }
        }}
      >
        <Center style={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title order={3} py="lg">
            Reset your password
          </Title>
        </Center>
        <OperationOutcomeAlert issues={getIssuesForExpression(outcome, undefined)} mb="lg" />
        {!success && (
          <>
            <Stack gap="sm" mb="md">
              <TextInput
                name="email"
                type="email"
                label="Email"
                placeholder="name@domain.com"
                required={true}
                autoFocus={true}
                error={getErrorsForInput(outcome, 'email')}
              />
            </Stack>
            <Stack gap="xs">
              <SubmitButton fullWidth>Reset Password</SubmitButton>
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
                <Anchor onClick={() => navigate('/signin')?.catch(console.error)}>Back to Sign In</Anchor>
              </Text>
              {isRegisterEnabled() && (
                <Text
                  size="sm"
                  mt="none"
                  c="dimmed"
                  style={{ textAlign: 'center' }}
                  data-dashlane-ignore="true"
                  data-lp-ignore="true"
                  data-no-autofill="true"
                  data-form-type="navigation"
                >
                  Don't have an account?{' '}
                  <Anchor onClick={() => navigate('/register')?.catch(console.error)}>Sign Up</Anchor>
                </Text>
              )}
            </Stack>
          </>
        )}
        {success && (
          <Text c="dimmed" size="sm" ta="center" mt="md">
            If the account exists on our system, a password reset email will be sent.
          </Text>
        )}
      </Form>
    </Document>
  );
}
