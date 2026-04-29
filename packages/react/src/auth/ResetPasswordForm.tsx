// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Flex, Stack, Text, TextInput, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { Logo } from '../Logo/Logo';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { getErrorsForInput, getIssuesForExpression } from '../utils/outcomes';
import { getRecaptcha, initRecaptcha } from '../utils/recaptcha';

export interface ResetPasswordFormProps {
  readonly projectId?: string;
  readonly recaptchaSiteKey?: string;
  readonly onSuccess?: () => void;
  readonly onSignIn?: () => void;
  readonly onRegister?: () => void;
}

export function ResetPasswordForm(props: ResetPasswordFormProps): JSX.Element {
  const { projectId, recaptchaSiteKey, onSuccess, onSignIn, onRegister } = props;
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

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
            onSuccess?.();
          } catch (err) {
            setOutcome(normalizeOperationOutcome(err));
          }
        }}
      >
        <Flex direction="column" align="center" justify="center">
          <Logo size={32} />
          <Title order={3} py="lg">
            Reset your password
          </Title>
        </Flex>
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
              {onSignIn && (
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
                  <Anchor onClick={onSignIn}>Back to Sign In</Anchor>
                </Text>
              )}
              {onRegister && (
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
                  Don't have an account? <Anchor onClick={onRegister}>Sign Up</Anchor>
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
