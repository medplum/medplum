import { GoogleCredentialResponse, OperationOutcome } from '@medplum/core';
import React, { useState } from 'react';
import { Button } from './Button';
import { FormSection } from "./FormSection";
import { parseForm } from './FormUtils';
import { Logo } from './Logo';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';
import { TextField } from './TextField';
import './SignInForm.css';

export interface SignInFormProps {
  role?: string;
  scope?: string;
  remember?: boolean;
  googleClientId?: string;
  onSuccess: () => void;
  onForgotPassword?: () => void;
  onRegister?: () => void;
}

export function SignInForm(props: SignInFormProps) {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const role = props.role || 'practitioner';
  const scope = props.scope || 'launch/patient openid fhirUser offline_access user/*.*';

  function handleError(err: any): void {
    if (err.outcome) {
      setOutcome(err.outcome);
    }
  }

  return (
    <form style={{ maxWidth: 400 }} onSubmit={(e: React.SyntheticEvent) => {
      e.preventDefault();

      const formData = parseForm(e.target as HTMLFormElement);
      const remember = !!props.remember;
      medplum.signIn(formData.email, formData.password, role, scope, remember)
        .then(() => props.onSuccess())
        .catch(handleError);
    }}>
      <div className="center">
        <Logo size={32} />
        <h1>Sign in to Medplum</h1>
      </div>
      <FormSection title="Email">
        <TextField id="email" type="email" testid="email" required={true} autoFocus={true} outcome={outcome} />
      </FormSection>
      <FormSection title="Password">
        <TextField id="password" type="password" testid="password" required={true} outcome={outcome} />
      </FormSection>
      <div className="medplum-signin-buttons">
        <div>
          {props.onForgotPassword && (
            <MedplumLink testid="forgotpassword" onClick={props.onForgotPassword}>Forgot password</MedplumLink>
          )}
          {props.onRegister && (
            <MedplumLink testid="register" onClick={props.onRegister}>Register</MedplumLink>
          )}
        </div>
        <div>
          <Button type="submit" testid="submit">Sign in</Button>
        </div>
      </div>
      {props.googleClientId && (
        <div className="medplum-signin-google-container">
          <Button type="button" onClick={() => {
            // Sign In With Google JavaScript API reference
            // https://developers.google.com/identity/gsi/web/reference/js-reference
            const google = (window as any).google;
            google.accounts.id.initialize({
              client_id: props.googleClientId,
              callback: (response: GoogleCredentialResponse) => {
                medplum.signInWithGoogle(response)
                  .then(() => props.onSuccess())
                  .catch(handleError);
              }
            });
            google.accounts.id.prompt();
          }}>Sign in with Google</Button>
        </div>
      )}
    </form>
  );
}
