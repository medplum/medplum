import { badRequest } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Logo, MedplumLink, Input, useMedplum } from '@medplum/ui';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

export function SetPasswordPage(): JSX.Element {
  const { id, secret } = useParams() as { id: string; secret: string };
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  return (
    <Document width={450}>
      <Form
        style={{ maxWidth: 400 }}
        onSubmit={(formData: Record<string, string>) => {
          if (formData.password !== formData.confirmPassword) {
            setOutcome(badRequest('Passwords do not match', 'confirmPassword'));
            return;
          }
          setOutcome(undefined);
          const body = {
            id,
            secret,
            password: formData.password,
          };
          medplum
            .post('auth/setpassword', body)
            .then(() => setSuccess(true))
            .catch(setOutcome);
        }}
      >
        <div className="center">
          <Logo size={32} />
          <h1>Set password</h1>
        </div>
        {!success && (
          <>
            <FormSection title="New password" htmlFor="password" outcome={outcome}>
              <Input name="password" type="password" testid="password" required={true} outcome={outcome} />
            </FormSection>
            <FormSection title="Confirm new password" htmlFor="confirmPassword" outcome={outcome}>
              <Input
                name="confirmPassword"
                type="password"
                testid="confirmPassword"
                required={true}
                outcome={outcome}
              />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div></div>
              <div>
                <Button type="submit">Set password</Button>
              </div>
            </div>
          </>
        )}
        {success && (
          <div data-testid="success">
            Password set. You can now&nbsp;<MedplumLink to="/signin">sign in</MedplumLink>.
          </div>
        )}
      </Form>
    </Document>
  );
}
