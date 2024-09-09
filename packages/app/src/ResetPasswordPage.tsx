import { Anchor, Button, Group, Stack, TextInput, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import {
  Document,
  Form,
  getErrorsForInput,
  getIssuesForExpression,
  getRecaptcha,
  initRecaptcha,
  Logo,
  OperationOutcomeAlert,
  useMedplum,
} from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConfig } from './config';

export function ResetPasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);
  const recaptchaSiteKey = getConfig().recaptchaSiteKey;

  useEffect(() => {
    if (recaptchaSiteKey) {
      initRecaptcha(recaptchaSiteKey);
    }
  }, [recaptchaSiteKey]);

  return (
    <Document width={450}>
      <Form
        onSubmit={async (formData: Record<string, string>) => {
          let recaptchaToken = '';
          if (recaptchaSiteKey) {
            recaptchaToken = await getRecaptcha(recaptchaSiteKey);
          }

          medplum
            .post('auth/resetpassword', { ...formData, recaptchaToken })
            .then(() => setSuccess(true))
            .catch((err) => setOutcome(normalizeOperationOutcome(err)));
        }}
      >
        <Stack gap="lg" mb="xl" align="center">
          <Logo size={32} />
          <Title>Medplum Password Reset</Title>
        </Stack>
        <Stack gap="xl">
          <OperationOutcomeAlert issues={getIssuesForExpression(outcome, undefined)} />
          {!success && (
            <>
              <TextInput
                name="email"
                type="email"
                label="Email"
                required={true}
                autoFocus={true}
                error={getErrorsForInput(outcome, 'email')}
              />
              <Group justify="space-between" mt="xl" wrap="nowrap">
                <Anchor component="button" type="button" color="dimmed" onClick={() => navigate('/register')} size="xs">
                  Register
                </Anchor>
                <Button type="submit">Reset password</Button>
              </Group>
            </>
          )}
          {success && <div>If the account exists on our system, a password reset email will be sent.</div>}
        </Stack>
      </Form>
    </Document>
  );
}
