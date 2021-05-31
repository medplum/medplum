import React from 'react';
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
  const role = props.role || 'practitioner';
  const scope = props.scope || 'launch/patient openid fhirUser offline_access user/*.*';

  return (
    <form style={{ maxWidth: 400 }} onSubmit={(e: React.SyntheticEvent) => {
      e.preventDefault();

      const formData = parseForm(e.target as HTMLFormElement);
      medplum.signIn(formData.email, formData.password, role, scope)
        .then(() => {
          if (props.onSuccess) {
            props.onSuccess();
          }
        });
    }}>
      <FormSection title="Email">
        <TextField id="email" type="email" required={true} autoFocus={true} />
      </FormSection>
      <FormSection title="Password">
        <TextField id="password" type="password" required={true} />
      </FormSection>
      <Button type="submit">Submit</Button>
    </form>
  );
}
