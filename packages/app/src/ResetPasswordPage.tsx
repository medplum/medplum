import { Anchor, Button, Group, Stack, TextInput, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, Form, getErrorsForInput, getRecaptcha, initRecaptcha, Logo, useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function ResetPasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);
  const recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY as string;

  useEffect(() => {
    if (recaptchaSiteKey) {
      initRecaptcha(recaptchaSiteKey);
    }
  }, [recaptchaSiteKey]);

  return (
    <Document width={450}>
      <Form
        style={{ maxWidth: 400 }}
        onSubmit={async (formData: Record<string, string>) => {
          let recaptchaToken = '';
          if (recaptchaSiteKey) {
            recaptchaToken = await getRecaptcha(recaptchaSiteKey);
          }

          medplum
            .post('auth/resetpassword', { ...formData, recaptchaToken })
            .then(() => setSuccess(true))
            .catch((err) => {
              setOutcome(normalizeOperationOutcome(err));
            });
        }}
      >
        <Stack spacing="lg" mb="xl" align="center">
          <Logo size={32} />
          <Title>Medplum Password Reset</Title>
        </Stack>
        {!success && (
          <Stack spacing="xl">
            <TextInput
              name="email"
              type="email"
              label="Email"
              required={true}
              autoFocus={true}
              error={getErrorsForInput(outcome, 'email')}
            />
            <Group position="apart" mt="xl" noWrap>
              <Anchor component="button" type="button" color="dimmed" onClick={() => navigate('/register')} size="xs">
                Register
              </Anchor>
              <Button type="submit">Reset password</Button>
            </Group>
          </Stack>
        )}
        {success && <div data-testid="success">Email sent</div>}
      </Form>
    </Document>
  );
}
