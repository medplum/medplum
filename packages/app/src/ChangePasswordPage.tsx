import { OperationOutcome } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Logo, TextField, useMedplum } from '@medplum/ui';
import React, { useState } from 'react';

export function ChangePasswordPage() {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  return (
    <Document width={450}>
      <Form style={{ maxWidth: 400 }} onSubmit={(formData: Record<string, string>) => {
        medplum.post('auth/changepassword', formData)
          .then(() => setSuccess(true))
          .catch(err => {
            if (err.outcome) {
              setOutcome(err.outcome);
            }
          })
      }}>
        <div className="center">
          <Logo size={32} />
          <h1>Change password</h1>
        </div>
        {!success && (
          <>
            <FormSection title="Old password" htmlFor="oldPassword" outcome={outcome}>
              <TextField name="oldPassword" type="password" testid="oldPassword" required={true} autoFocus={true} outcome={outcome} />
            </FormSection>
            <FormSection title="New password" htmlFor="newPassword" outcome={outcome}>
              <TextField name="newPassword" type="password" testid="newPassword" required={true} outcome={outcome} />
            </FormSection>
            <FormSection title="Confirm new password" htmlFor="confirmPassword" outcome={outcome}>
              <TextField name="confirmPassword" type="password" testid="confirmPassword" required={true} outcome={outcome} />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div>
              </div>
              <div>
                <Button type="submit" testid="submit">Change password</Button>
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
