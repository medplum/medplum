import { RegisterRequest } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Logo, Input, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { getRecaptcha, initRecaptcha } from './utils';

export function RegisterPage(): JSX.Element {
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
              .register({
                ...formData,
                recaptchaToken,
              } as unknown as RegisterRequest)
              .then(() => setSuccess(true))
              .catch(setOutcome);
          });
        }}
      >
        <div className="center">
          <Logo size={32} />
          <h1>Register new account</h1>
        </div>
        {!success && (
          <>
            <FormSection title="First Name" htmlFor="firstName" outcome={outcome}>
              <Input
                name="firstName"
                type="text"
                testid="firstName"
                required={true}
                autoFocus={true}
                outcome={outcome}
              />
            </FormSection>
            <FormSection title="Last Name" htmlFor="lastName" outcome={outcome}>
              <Input name="lastName" type="text" testid="lastName" required={true} outcome={outcome} />
            </FormSection>
            <FormSection title="Project Name" htmlFor="projectName" outcome={outcome}>
              <Input name="projectName" type="text" testid="projectName" required={true} outcome={outcome} />
            </FormSection>
            <FormSection title="Email" htmlFor="email" outcome={outcome}>
              <Input name="email" type="email" testid="email" required={true} outcome={outcome} />
            </FormSection>
            <FormSection title="Password" htmlFor="password" outcome={outcome}>
              <Input name="password" type="password" testid="password" required={true} outcome={outcome} />
            </FormSection>
            <p style={{ fontSize: '12px', color: '#888' }}>
              By clicking submit you agree to the Medplum
              <br />
              <a href="https://www.medplum.com/privacy">Privacy Policy</a>
              &nbsp;and&nbsp;
              <a href="https://www.medplum.com/terms">Terms of Service</a>.
            </p>
            <p style={{ fontSize: '12px', color: '#888' }}>
              This site is protected by reCAPTCHA and the Google
              <br />
              <a href="https://policies.google.com/privacy">Privacy Policy</a>
              &nbsp;and&nbsp;
              <a href="https://policies.google.com/terms">Terms of Service</a> apply.
            </p>
            <div className="medplum-signin-buttons">
              <div />
              <div>
                <Button type="submit" testid="submit">
                  Create account
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
