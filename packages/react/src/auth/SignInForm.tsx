import { LoginAuthenticationResponse } from '@medplum/core';
import { ProjectMembership } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Document } from '../Document';
import { useMedplum } from '../MedplumProvider';
import { AuthenticationForm } from './AuthenticationForm';
import { ChooseProfileForm } from './ChooseProfileForm';
import { ChooseScopeForm } from './ChooseScopeForm';
import { NewProjectForm } from './NewProjectForm';

export interface SignInFormProps {
  readonly remember?: boolean;
  readonly projectId?: string;
  readonly googleClientId?: string;
  readonly clientId?: string;
  readonly scope?: string;
  readonly nonce?: string;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: string;
  readonly resourceType?: string;
  readonly chooseScopes?: boolean;
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
      if (props.chooseScopes) {
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
    if (props.onCode) {
      props.onCode(code);
    } else {
      medplum
        .processCode(code)
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
              projectId={props.projectId}
              clientId={props.clientId}
              resourceType={props.resourceType}
              scope={props.scope}
              nonce={props.nonce}
              googleClientId={props.googleClientId}
              generatePkce={!props.onCode}
              codeChallenge={props.codeChallenge}
              codeChallengeMethod={props.codeChallengeMethod}
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
        } else if (props.chooseScopes) {
          return <ChooseScopeForm login={login} scope={props.scope} handleAuthResponse={handleScopeResponse} />;
        } else {
          return <div>Success</div>;
        }
      })()}
    </Document>
  );
}
