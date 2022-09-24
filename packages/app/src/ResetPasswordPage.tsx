import { Button, TextInput } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import {
  Document,
  Form,
  getErrorsForInput,
  getRecaptcha,
  initRecaptcha,
  Logo,
  MedplumLink,
  useMedplum,
} from '@medplum/react';
import React, { useEffect, useState } from 'react';

const recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY as string;

export function ResetPasswordPage(): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    initRecaptcha(recaptchaSiteKey);
  }, []);

  return (
    <Document width={450}>
      <Form
        style={{ maxWidth: 400 }}
        onSubmit={(formData: Record<string, string>) => {
          getRecaptcha(recaptchaSiteKey)
            .then((recaptchaToken: string) => medplum.post('auth/resetpassword', { ...formData, recaptchaToken }))
            .then(() => setSuccess(true))
            .catch(setOutcome);
        }}
      >
        <div className="medplum-center">
          <Logo size={32} />
          <h1>Medplum Password Reset</h1>
        </div>
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
            <div className="medplum-signin-buttons">
              <div>
                <MedplumLink testid="register" to="/register">
                  Register
                </MedplumLink>
              </div>
              <div>
                <Button type="submit">Reset password</Button>
              </div>
            </div>
          </>
        )}
        {success && <div data-testid="success">Email sent</div>}
      </Form>
    </Document>
  );
}
