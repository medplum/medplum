import { GoogleCredentialResponse, LoginAuthenticationResponse } from '@medplum/core';
import { OperationOutcome, ProjectMembership } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Document } from './Document';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { getGoogleClientId, GoogleButton } from './GoogleButton';
import { Input } from './Input';
import { Logo } from './Logo';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';
import './SignInForm.css';
import './util.css';
import { getIssuesForExpression } from './utils/outcomes';

export interface SignInFormProps {
  readonly remember?: boolean;
  readonly projectId?: string;
  readonly googleClientId?: string;
  readonly clientId?: string;
  readonly scope?: string;
  readonly nonce?: string;
  readonly onSuccess?: () => void;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly onCode?: (code: string) => void;
  readonly children?: React.ReactNode;
}

export function SignInForm(props: SignInFormProps): JSX.Element {
  const medplum = useMedplum();
  const [login, setLogin] = useState<string | undefined>(undefined);
  const [memberships, setMemberships] = useState<ProjectMembership[] | undefined>(undefined);

  function handleAuthResponse(response: LoginAuthenticationResponse): void {
    if (response.login) {
      setLogin(response.login);
    }

    if (response.memberships) {
      setMemberships(response.memberships);
    }

    if (response.code) {
      if (props.onCode) {
        props.onCode(response.code);
      } else {
        medplum
          .processCode(response.code)
          .then(() => {
            if (props.onSuccess) {
              props.onSuccess();
            }
          })
          .catch(console.log);
      }
    }
  }

  return (
    <Document width={450}>
      {(() => {
        if (!login) {
          return (
            <AuthenticationForm
              clientId={props.clientId}
              scope={props.scope}
              nonce={props.nonce}
              googleClientId={props.googleClientId}
              onForgotPassword={props.onForgotPassword}
              onRegister={props.onRegister}
              handleAuthResponse={handleAuthResponse}
            >
              {props.children}
            </AuthenticationForm>
          );
        } else if (memberships) {
          return <ProfileForm login={login} memberships={memberships} handleAuthResponse={handleAuthResponse} />;
        } else {
          return <div>Success</div>;
        }
      })()}
    </Document>
  );
}

interface AuthenticationFormProps {
  readonly projectId?: string;
  readonly clientId?: string;
  readonly scope?: string;
  readonly nonce?: string;
  readonly googleClientId?: string;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly children?: React.ReactNode;
}

function AuthenticationForm(props: AuthenticationFormProps): JSX.Element {
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
            clientId: props.clientId,
            scope: props.scope,
            nonce: props.nonce,
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
                    clientId: props.clientId,
                    scope: props.scope,
                    nonce: props.nonce,
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

interface ProfileFormProps {
  login: string;
  memberships: ProjectMembership[];
  handleAuthResponse: (response: any) => void;
}

function ProfileForm(props: ProfileFormProps): JSX.Element {
  const medplum = useMedplum();
  return (
    <div>
      <div className="medplum-center">
        <Logo size={32} />
        <h1>Choose profile</h1>
      </div>
      {props.memberships.map((membership: ProjectMembership) => (
        <div
          className="medplum-nav-menu-profile"
          key={membership.id}
          onClick={() => {
            medplum
              .post('auth/profile', {
                login: props.login,
                profile: membership.id,
              })
              .then(props.handleAuthResponse);
          }}
        >
          <div className="medplum-nav-menu-profile-icon">
            <Avatar alt={membership.profile?.display} />
          </div>
          <div className="medplum-nav-menu-profile-label">
            {membership.profile?.display}
            <div className="medplum-nav-menu-profile-help-text">{membership.project?.display}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
