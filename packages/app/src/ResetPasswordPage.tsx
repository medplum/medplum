import { OperationOutcome } from '@medplum/fhirtypes';
import {
  Button,
  Document,
  Form,
  FormSection,
  getRecaptcha,
  initRecaptcha,
  Input,
  Logo,
  MedplumLink,
  useMedplum,
} from '@medplum/react';
import React, { useEffect, useState } from 'react';

export function ResetPasswordPage(): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    initRecaptcha();
  }, []);

  return (
    <Document width={450}>
      <Form
        style={{ maxWidth: 400 }}
        onSubmit={(formData: Record<string, string>) => {
          getRecaptcha().then((recaptchaToken: string) => {
            medplum
              .post('auth/resetpassword', { ...formData, recaptchaToken })
              .then(() => setSuccess(true))
              .catch(setOutcome);
          });
        }}
      >
        <div className="medplum-center">
          <Logo size={32} />
          <h1>Medplum Password Reset</h1>
        </div>
        {!success && (
          <>
            <FormSection title="Email" htmlFor="email" outcome={outcome}>
              <Input name="email" type="email" testid="email" required={true} autoFocus={true} outcome={outcome} />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div>
                <MedplumLink testid="register" to="/register">
                  Register
                </MedplumLink>
              </div>
              <div>
                <Button type="submit" testid="submit">
                  Reset password
                </Button>
              </div>
            </div>
          </>
        )}
        {success && <div data-testid="success">Email sent</div>}
      </Form>
    </Document>
  );
}
