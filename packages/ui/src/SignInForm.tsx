import { OperationOutcome } from '@medplum/core';
import React, { useState } from 'react';
import { Button } from './Button';
import { FormSection } from "./FormSection";
import { parseForm } from './FormUtils';
import { useMedplum } from './MedplumProvider';
import { TextField } from './TextField';

export interface SignInFormProps {
  role?: string;
  scope?: string;
  onSuccess?: () => void;
}

export function SignInForm(props: SignInFormProps) {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();


  const role = props.role || 'practitioner';
  const scope = props.scope || 'launch/patient openid fhirUser offline_access user/*.*';

  return (
    <form style={{ maxWidth: 400 }} onSubmit={(e: React.SyntheticEvent) => {
      e.preventDefault();

      const formData = parseForm(e.target as HTMLFormElement);
      const remember = formData.remember === 'true';
      medplum.signIn(formData.email, formData.password, role, scope, remember)
        .then(() => {
          if (props.onSuccess) {
            props.onSuccess();
          }
        })
        .catch(err => {
          if (err.outcome) {
            setOutcome(err.outcome);
          }
        })
    }}>
      <div className="center">
        <h1>Sign in</h1>
      </div>
      <FormSection title="Email">
        <TextField id="email" type="email" required={true} autoFocus={true} outcome={outcome} />
      </FormSection>
      <FormSection title="Password">
        <TextField id="password" type="password" required={true} outcome={outcome} />
      </FormSection>
      <FormSection title="Remember me">
        <input type="checkbox" name="remember" value="true" />
      </FormSection>
      <div className="right">
        <Button type="submit">Submit</Button>
      </div>
    </form>
  );
}
