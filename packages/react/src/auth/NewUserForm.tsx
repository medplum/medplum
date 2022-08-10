import { GoogleCredentialResponse, LoginAuthenticationResponse } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { Button } from '../Button';
import { Form } from '../Form';
import { FormSection } from '../FormSection';
import { getGoogleClientId, GoogleButton } from '../GoogleButton';
import { Input } from '../Input';
import { useMedplum } from '../MedplumProvider';
import { getIssuesForExpression } from '../utils/outcomes';
import { getRecaptcha, initRecaptcha } from '../utils/recaptcha';

export interface NewUserFormProps {
  readonly projectId: string;
  readonly googleClientId?: string;
  readonly recaptchaSiteKey: string;
  readonly children?: React.ReactNode;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
}

export function NewUserForm(props: NewUserFormProps): JSX.Element {
  const googleClientId = getGoogleClientId(props.googleClientId);
  const recaptchaSiteKey = props.recaptchaSiteKey;
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  useEffect(() => initRecaptcha(recaptchaSiteKey), [recaptchaSiteKey]);

  return (
    <Form
      style={{ maxWidth: 400 }}
      onSubmit={async (formData: Record<string, string>) => {
        try {
          const recaptchaToken = await getRecaptcha(recaptchaSiteKey);
          props.handleAuthResponse(
            await medplum.startNewUser({
              projectId: props.projectId,
              firstName: formData.firstName,
              lastName: formData.lastName,
              email: formData.email,
              password: formData.password,
              remember: formData.remember === 'true',
              recaptchaSiteKey,
              recaptchaToken,
            })
          );
        } catch (err) {
          setOutcome(err as OperationOutcome);
        }
      }}
    >
      <div className="medplum-center">{props.children}</div>
      {issues && (
        <div className="medplum-input-error">
          {issues.map((issue) => (
            <div data-testid="text-field-error" key={issue.details?.text}>
              {issue.details?.text}
            </div>
          ))}
        </div>
      )}
      {googleClientId && (
        <>
          <div className="medplum-signin-google-container">
            <GoogleButton
              googleClientId={googleClientId}
              handleGoogleCredential={async (response: GoogleCredentialResponse) => {
                try {
                  props.handleAuthResponse(
                    await medplum.startGoogleLogin({
                      googleClientId: response.clientId,
                      googleCredential: response.credential,
                      createUser: true,
                    })
                  );
                } catch (err) {
                  setOutcome(err as OperationOutcome);
                }
              }}
            />
          </div>
          <div className="medplum-signin-separator">or</div>
        </>
      )}
      <FormSection title="First Name" htmlFor="firstName" outcome={outcome}>
        <Input
          name="firstName"
          type="text"
          testid="firstName"
          placeholder="First name"
          required={true}
          autoFocus={true}
          outcome={outcome}
        />
      </FormSection>
      <FormSection title="Last Name" htmlFor="lastName" outcome={outcome}>
        <Input
          name="lastName"
          type="text"
          testid="lastName"
          placeholder="Last name"
          required={true}
          outcome={outcome}
        />
      </FormSection>
      <FormSection title="Email" htmlFor="email" outcome={outcome}>
        <Input
          name="email"
          type="email"
          testid="email"
          placeholder="name@domain.com"
          required={true}
          outcome={outcome}
        />
      </FormSection>
      <FormSection title="Password" htmlFor="password" outcome={outcome}>
        <Input name="password" type="password" testid="password" autoComplete="off" required={true} outcome={outcome} />
      </FormSection>
      <p style={{ fontSize: '12px', color: '#888' }}>
        By clicking submit you agree to the Medplum <a href="https://www.medplum.com/privacy">Privacy&nbsp;Policy</a>
        {' and '}
        <a href="https://www.medplum.com/terms">Terms&nbsp;of&nbsp;Service</a>.
      </p>
      <p style={{ fontSize: '12px', color: '#888' }}>
        This site is protected by reCAPTCHA and the Google{' '}
        <a href="https://policies.google.com/privacy">Privacy&nbsp;Policy</a>
        {' and '}
        <a href="https://policies.google.com/terms">Terms&nbsp;of&nbsp;Service</a> apply.
      </p>
      <div className="medplum-signin-buttons">
        <div>
          <input type="checkbox" id="remember" name="remember" value="true" />
          <label htmlFor="remember">Remember me</label>
        </div>
        <div>
          <Button type="submit" testid="submit">
            Create account
          </Button>
        </div>
      </div>
    </Form>
  );
}
