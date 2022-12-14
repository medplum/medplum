import { BaseLoginRequest, LoginAuthenticationResponse } from '@medplum/core';
import { ProjectMembership } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Document } from '../Document/Document';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { AuthenticationForm } from './AuthenticationForm';
import { ChooseProfileForm } from './ChooseProfileForm';
import { ChooseScopeForm } from './ChooseScopeForm';
import { MfaForm } from './MfaForm';
import { NewProjectForm } from './NewProjectForm';

export interface SignInFormProps extends BaseLoginRequest {
  readonly chooseScopes?: boolean;
  readonly onSuccess?: () => void;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly onCode?: (code: string) => void;
  readonly children?: React.ReactNode;
}

/**
 * The SignInForm component allows users to sign in to Medplum.
 *
 * "Signing in" is a multi-step process:
 * 1) Authentication - identify the user
 * 2) MFA - If MFA is enabled, prompt for MFA code
 * 3) Choose profile - If the user has multiple profiles, prompt to choose one
 * 4) Choose scope - If the user has multiple scopes, prompt to choose one
 * 5) Success - Return to the caller with either a code or a redirect
 */
export function SignInForm(props: SignInFormProps): JSX.Element {
  const { chooseScopes, onSuccess, onForgotPassword, onRegister, onCode, ...baseLoginRequest } = props;
  const medplum = useMedplum();
  const [login, setLogin] = useState<string | undefined>(undefined);
  const [mfaRequired, setAuthenticatorRequired] = useState<boolean>(false);
  const [memberships, setMemberships] = useState<ProjectMembership[] | undefined>(undefined);

  function handleAuthResponse(response: LoginAuthenticationResponse): void {
    setAuthenticatorRequired(!!response.mfaRequired);

    if (response.login) {
      setLogin(response.login);
    }

    if (response.memberships) {
      setMemberships(response.memberships);
    }

    if (response.code) {
      if (chooseScopes) {
        setMemberships(undefined);
      } else {
        handleCode(response.code as string);
      }
    }
  }

  function handleScopeResponse(response: LoginAuthenticationResponse): void {
    handleCode(response.code as string);
  }

  function handleCode(code: string): void {
    if (onCode) {
      onCode(code);
    } else {
      medplum
        .processCode(code)
        .then(() => {
          if (onSuccess) {
            onSuccess();
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
              generatePkce={!onCode}
              onForgotPassword={onForgotPassword}
              onRegister={onRegister}
              handleAuthResponse={handleAuthResponse}
              {...baseLoginRequest}
            >
              {props.children}
            </AuthenticationForm>
          );
        } else if (mfaRequired) {
          return <MfaForm login={login} handleAuthResponse={handleAuthResponse} />;
        } else if (memberships) {
          return <ChooseProfileForm login={login} memberships={memberships} handleAuthResponse={handleAuthResponse} />;
        } else if (props.projectId === 'new') {
          return <NewProjectForm login={login} handleAuthResponse={handleAuthResponse} />;
        } else if (props.chooseScopes) {
          return <ChooseScopeForm login={login} scope={props.scope} handleAuthResponse={handleScopeResponse} />;
        } else {
          return <div>Success</div>;
        }
      })()}
    </Document>
  );
}
