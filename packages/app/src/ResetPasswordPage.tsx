import { OperationOutcome } from '@medplum/core';
import { Button, Document, Form, FormSection, Logo, MedplumLink, TextField, useMedplum } from '@medplum/ui';
import React, { useState } from 'react';

export function ResetPasswordPage() {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  return (
    <Document width={450}>
      <Form style={{ maxWidth: 400 }} onSubmit={(formData: Record<string, string>) => {
        medplum.post('auth/resetpassword', formData)
          .then(() => setSuccess(true))
          .catch(err => {
            if (err.outcome) {
              setOutcome(err.outcome);
            }
          })
      }}>
        <div className="center">
          <Logo size={32} />
          <h1>Medplum Password Reset</h1>
        </div>
        {!success && (
          <>
            <FormSection title="Email">
              <TextField name="email" type="email" testid="email" required={true} autoFocus={true} outcome={outcome} />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div>
                <MedplumLink testid="register" to="/register">Register</MedplumLink>
              </div>
              <div>
                <Button type="submit" testid="submit">Reset password</Button>
              </div>
            </div>
          </>
        )}
        {success && (
          <div data-testid="success">Email sent</div>
        )}
      </Form>
    </Document>
  );
}
