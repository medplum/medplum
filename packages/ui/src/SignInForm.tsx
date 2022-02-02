import { GoogleCredentialResponse } from '@medplum/core';
import { OperationOutcome, ProjectMembership } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Document } from './Document';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { Logo } from './Logo';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';
import { TextField } from './TextField';
import { getIssuesForExpression } from './utils/outcomes';
import './SignInForm.css';

export interface SignInFormProps {
  scopes?: string;
  remember?: boolean;
  googleClientId?: string;
  onSuccess?: () => void;
  onForgotPassword?: () => void;
  onRegister?: () => void;
  children?: React.ReactNode;
}

export function SignInForm(props: SignInFormProps): JSX.Element {
  const medplum = useMedplum();
  const [login, setLogin] = useState<string | undefined>(undefined);
  const [memberships, setMemberships] = useState<ProjectMembership[] | undefined>(undefined);

  function handleAuthResponse(response: any): void {
    if (response.login) {
      setLogin(response.login);
    }

    if (response.memberships) {
      setMemberships(response.memberships);
    }

    if (response.code) {
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

  return (
    <Document width={450}>
      {(() => {
        if (!login) {
          return (
            <AuthenticationForm
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
  googleClientId?: string;
  onForgotPassword?: () => void;
  onRegister?: () => void;
  handleAuthResponse: (response: any) => void;
  children?: React.ReactNode;
}

function AuthenticationForm(props: AuthenticationFormProps): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  return (
    <Form
      style={{ maxWidth: 400 }}
      onSubmit={(formData: Record<string, string>) => {
        medplum
          .startLogin(formData.email, formData.password, formData.remember === 'true')
          .then(props.handleAuthResponse)
          .catch(setOutcome);
      }}
    >
      <div className="center">{props.children}</div>
      {issues && (
        <div className="medplum-input-error">
          {issues.map((issue) => (
            <div data-testid="text-field-error" key={issue.details?.text}>
              {issue.details?.text}
            </div>
          ))}
        </div>
      )}
      <FormSection title="Email" htmlFor="email" outcome={outcome}>
        <TextField name="email" type="email" testid="email" required={true} autoFocus={true} outcome={outcome} />
      </FormSection>
      <FormSection title="Password" htmlFor="password" outcome={outcome}>
        <TextField
          name="password"
          type="password"
          testid="password"
          autoComplete="off"
          required={true}
          outcome={outcome}
        />
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
      {props.googleClientId && (
        <div className="medplum-signin-google-container">
          <Button
            type="button"
            onClick={() => {
              // Sign In With Google JavaScript API reference
              // https://developers.google.com/identity/gsi/web/reference/js-reference
              const google = (window as any).google;
              google.accounts.id.initialize({
                client_id: props.googleClientId,
                callback: (response: GoogleCredentialResponse) => {
                  medplum.startGoogleLogin(response).then(props.handleAuthResponse).catch(setOutcome);
                },
              });
              google.accounts.id.prompt();
            }}
          >
            <span className="medplum-signin-google-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 40 40">
                <path
                  fill="#4285F4"
                  d="M35 20.345c0-1.02-.084-2.045-.264-3.048H20.302v5.776h8.266c-.343 1.863-1.445 3.51-3.06 4.558v3.748h4.932c2.896-2.613 4.56-6.47 4.56-11.034z"
                ></path>
                <path
                  fill="#34A853"
                  d="M20.302 35c4.127 0 7.607-1.328 10.143-3.62l-4.93-3.749c-1.373.915-3.144 1.433-5.207 1.433-3.993 0-7.377-2.64-8.592-6.189H6.627v3.863C9.225 31.804 14.517 35 20.302 35z"
                ></path>
                <path
                  fill="#FBBC04"
                  d="M11.71 22.875c-.64-1.863-.64-3.88 0-5.743V13.27H6.629c-2.17 4.238-2.17 9.231 0 13.47l5.083-3.864z"
                ></path>
                <path
                  fill="#EA4335"
                  d="M20.302 10.937c2.181-.033 4.29.772 5.87 2.249l4.369-4.283c-2.767-2.546-6.438-3.946-10.24-3.902-5.785 0-11.076 3.197-13.674 8.267l5.083 3.864c1.21-3.555 4.6-6.195 8.592-6.195z"
                ></path>
              </svg>
            </span>
            <span>Sign in with Google</span>
          </Button>
        </div>
      )}
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
      <div className="center">
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
