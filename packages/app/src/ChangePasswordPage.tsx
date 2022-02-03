import { OperationOutcome } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Logo, Input, useMedplum } from '@medplum/ui';
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
              <Input
                name="oldPassword"
                type="password"
                testid="oldPassword"
                required={true}
                autoFocus={true}
                outcome={outcome}
              />
            </FormSection>
            <FormSection title="New password" htmlFor="newPassword" outcome={outcome}>
              <Input name="newPassword" type="password" testid="newPassword" required={true} outcome={outcome} />
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
                <Button type="submit" testid="submit">
                  Change password
                </Button>
              </div>
            </div>
          </>
        )}
        {success && <div data-testid="success">Password changed successfully</div>}
      </Form>
    </Document>
  );
}
