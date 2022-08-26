import { GoogleCredentialResponse, LoginAuthenticationResponse } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Button } from '../Button';
import { Form } from '../Form';
import { FormSection } from '../FormSection';
import { getGoogleClientId, GoogleButton } from '../GoogleButton';
import { Input } from '../Input';
import { MedplumLink } from '../MedplumLink';
import { useMedplum } from '../MedplumProvider';
import { getIssuesForExpression } from '../utils/outcomes';

export interface AuthenticationFormProps {
  readonly projectId?: string;
  readonly clientId?: string;
  readonly scope?: string;
  readonly nonce?: string;
  readonly googleClientId?: string;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: string;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly children?: React.ReactNode;
}

export function AuthenticationForm(props: AuthenticationFormProps): JSX.Element {
  const medplum = useMedplum();
  const googleClientId = getGoogleClientId(props.googleClientId);
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  return (
    <Form
      style={{ maxWidth: 400 }}
      onSubmit={(formData: Record<string, string>) => {
        medplum
          .startLogin({
            projectId: props.projectId,
            clientId: props.clientId,
            scope: props.scope,
            nonce: props.nonce,
            codeChallenge: props.codeChallenge,
            codeChallengeMethod: props.codeChallengeMethod,
            email: formData.email,
            password: formData.password,
            remember: formData.remember === 'true',
          })
          .then(props.handleAuthResponse)
          .catch(setOutcome);
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
              handleGoogleCredential={(response: GoogleCredentialResponse) => {
                medplum
                  .startGoogleLogin({
                    projectId: props.projectId,
                    clientId: props.clientId,
                    scope: props.scope,
                    nonce: props.nonce,
                    codeChallenge: props.codeChallenge,
                    codeChallengeMethod: props.codeChallengeMethod,
                    googleClientId: response.clientId,
                    googleCredential: response.credential,
                  })
                  .then(props.handleAuthResponse)
                  .catch(setOutcome);
              }}
            />
          </div>
          <div className="medplum-signin-separator">or</div>
        </>
      )}
      <FormSection title="Email" htmlFor="email" outcome={outcome}>
        <Input name="email" type="email" testid="email" required={true} autoFocus={true} outcome={outcome} />
      </FormSection>
      <FormSection title="Password" htmlFor="password" outcome={outcome}>
        <Input name="password" type="password" testid="password" autoComplete="off" required={true} outcome={outcome} />
      </FormSection>
      <div className="medplum-signin-buttons">
        {(props.onForgotPassword || props.onRegister) && (
          <div>
            {props.onForgotPassword && (
              <MedplumLink testid="forgotpassword" onClick={props.onForgotPassword}>
                Forgot password
              </MedplumLink>
            )}
            {props.onRegister && (
              <MedplumLink testid="register" onClick={props.onRegister}>
                Register
              </MedplumLink>
            )}
          </div>
        )}
        <div>
          <input type="checkbox" id="remember" name="remember" value="true" />
          <label htmlFor="remember">Remember me</label>
        </div>
        <div>
          <Button type="submit" testid="submit">
            Sign in
          </Button>
        </div>
      </div>
    </Form>
  );
}
