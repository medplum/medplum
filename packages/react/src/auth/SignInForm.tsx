import { LoginAuthenticationResponse } from '@medplum/core';
import { ProjectMembership } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Document } from '../Document';
import { useMedplum } from '../MedplumProvider';
import { AuthenticationForm } from './AuthenticationForm';
import { ChooseProfileForm } from './ChooseProfileForm';
import { NewProjectForm } from './NewProjectForm';
import '../util.css';
import './SignInForm.css';

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
              projectId={props.projectId}
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
          return <ChooseProfileForm login={login} memberships={memberships} handleAuthResponse={handleAuthResponse} />;
        } else if (props.projectId === 'new') {
          return <NewProjectForm login={login} handleAuthResponse={handleAuthResponse} />;
        } else {
          return <div>Success</div>;
        }
      })()}
    </Document>
  );
}
