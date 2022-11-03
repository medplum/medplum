import { BaseLoginRequest, LoginAuthenticationResponse } from '@medplum/core';
import { ProjectMembership } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Document } from '../Document/Document';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { AuthenticationForm } from './AuthenticationForm';
import { ChooseProfileForm } from './ChooseProfileForm';
import { ChooseScopeForm } from './ChooseScopeForm';
import { NewProjectForm } from './NewProjectForm';

export interface SignInFormProps extends BaseLoginRequest {
  readonly chooseScopes?: boolean;
  readonly onSuccess?: () => void;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly onCode?: (code: string) => void;
  readonly children?: React.ReactNode;
}

export function SignInForm(props: SignInFormProps): JSX.Element {
  const { chooseScopes, onSuccess, onForgotPassword, onRegister, onCode, ...baseLoginRequest } = props;
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
