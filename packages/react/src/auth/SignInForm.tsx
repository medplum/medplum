import { showNotification } from '@mantine/notifications';
import { BaseLoginRequest, LoginAuthenticationResponse, normalizeErrorString } from '@medplum/core';
import { ProjectMembership } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Document } from '../Document/Document';
import { AuthenticationForm } from './AuthenticationForm';
import { ChooseProfileForm } from './ChooseProfileForm';
import { ChooseScopeForm } from './ChooseScopeForm';
import { MfaForm } from './MfaForm';
import { NewProjectForm } from './NewProjectForm';

export interface SignInFormProps extends BaseLoginRequest {
  readonly login?: string;
  readonly chooseScopes?: boolean;
  readonly disableEmailAuth?: boolean;
  readonly disableGoogleAuth?: boolean;
  readonly onSuccess?: () => void;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly onCode?: (code: string) => void;
  readonly children?: ReactNode;
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
 * @param props - The SignInForm React props.
 * @returns The SignInForm React node.
 */
export function SignInForm(props: SignInFormProps): JSX.Element {
  const {
    login: loginCode,
    chooseScopes,
    onSuccess,
    onForgotPassword,
    onRegister,
    onCode,
    ...baseLoginRequest
  } = props;
  const medplum = useMedplum();
  const [login, setLogin] = useState<string>();
  const loginRequested = useRef(false);
  const [mfaRequired, setAuthenticatorRequired] = useState(false);
  const [memberships, setMemberships] = useState<ProjectMembership[]>();

  const handleCode = useCallback(
    (code: string): void => {
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
          .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
      }
    },
    [medplum, onCode, onSuccess]
  );

  const handleAuthResponse = useCallback(
    (response: LoginAuthenticationResponse): void => {
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
    },
    [chooseScopes, handleCode]
  );

  const handleScopeResponse = useCallback(
    (response: LoginAuthenticationResponse): void => {
      handleCode(response.code as string);
    },
    [handleCode]
  );

  useEffect(() => {
    // Beware the race condition here
    // The `useMedplum` hook will return a new instance of the MedplumClient on login
    // We do not want to request the login status again in that case
    // Only request login status once
    if (loginCode && !loginRequested.current && !login) {
      loginRequested.current = true;
      medplum
        .get('auth/login/' + loginCode)
        .then(handleAuthResponse)
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    }
  }, [medplum, loginCode, loginRequested, login, handleAuthResponse]);

  return (
    <Document width={450} px="sm" py="md">
      {(() => {
        if (!login) {
          return (
            <AuthenticationForm
              onForgotPassword={onForgotPassword}
              onRegister={onRegister}
              handleAuthResponse={handleAuthResponse}
              disableGoogleAuth={props.disableGoogleAuth}
              disableEmailAuth={props.disableEmailAuth}
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
