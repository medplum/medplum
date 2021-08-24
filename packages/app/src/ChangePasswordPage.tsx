import { OperationOutcome } from '@medplum/core';
import { Button, Document, FormSection, Logo, parseForm, TextField, useMedplum } from '@medplum/ui';
import React, { useState } from 'react';

export function ChangePasswordPage() {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  return (
    <Document width={450}>
      <form style={{ maxWidth: 400 }} onSubmit={(e: React.SyntheticEvent) => {
        e.preventDefault();

        const formData = parseForm(e.target as HTMLFormElement);
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
            <FormSection title="Old password">
              <TextField id="oldPassword" type="password" testid="oldPassword" required={true} autoFocus={true} outcome={outcome} />
            </FormSection>
            <FormSection title="New password">
              <TextField id="newPassword" type="password" testid="newPassword" required={true} outcome={outcome} />
            </FormSection>
            <FormSection title="Confirm new password">
              <TextField id="confirmPassword" type="password" testid="confirmPassword" required={true} outcome={outcome} />
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
      </form>
    </Document>
  );
}
