import { Button, PasswordInput } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, Form, FormSection, getErrorsForInput, Logo, useMedplum } from '@medplum/react';
import React, { useState } from 'react';

export function ChangePasswordPage(): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  return (
    <Document width={450}>
      <Form
        style={{ maxWidth: 400 }}
        onSubmit={(formData: Record<string, string>) => {
          setOutcome(undefined);
          medplum
            .post('auth/changepassword', formData)
            .then(() => setSuccess(true))
            .catch(setOutcome);
        }}
      >
        <div className="medplum-center">
          <Logo size={32} />
          <h1>Change password</h1>
        </div>
        {!success && (
          <>
            <FormSection title="Old password" htmlFor="oldPassword" outcome={outcome}>
              <PasswordInput
                name="oldPassword"
                type="password"
                required={true}
                autoFocus={true}
                error={getErrorsForInput(outcome, 'oldPassword')}
              />
            </FormSection>
            <FormSection title="New password" htmlFor="newPassword" outcome={outcome}>
              <PasswordInput
                name="newPassword"
                type="password"
                required={true}
                error={getErrorsForInput(outcome, 'newPassword')}
              />
            </FormSection>
            <FormSection title="Confirm new password" htmlFor="confirmPassword" outcome={outcome}>
              <PasswordInput
                name="confirmPassword"
                type="password"
                required={true}
                error={getErrorsForInput(outcome, 'confirmPassword')}
              />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div></div>
              <div>
                <Button type="submit">Change password</Button>
              </div>
            </div>
          </>
        )}
        {success && <div data-testid="success">Password changed successfully</div>}
      </Form>
    </Document>
  );
}
