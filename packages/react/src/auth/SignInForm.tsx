// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { BaseLoginRequest, LoginAuthenticationResponse } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { ProjectMembership } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Document } from '../Document/Document';
import { AuthenticationForm } from './AuthenticationForm';
import { ChooseProfileForm } from './ChooseProfileForm';
import { ChooseScopeForm } from './ChooseScopeForm';
import { MfaEnrollForm } from './MfaEnrollForm';
import type { MfaMethod } from './MfaForm';
import { MfaVerificationForm } from './MfaVerificationForm';
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
  const [mfaEnrollRequired, setMfaEnrollRequired] = useState(false);
  const [enrollQrCode, setEnrollQrCode] = useState<string>();
  const [enrollMethods, setEnrollMethods] = useState<MfaMethod[]>();
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaMethods, setMfaMethods] = useState<MfaMethod[]>();
  const [mfaEmail, setMfaEmail] = useState<string>();
  const [mfaEmailMode, setMfaEmailMode] = useState(false);
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
          .catch((err: unknown) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
      }
    },
    [medplum, onCode, onSuccess]
  );

  const handleAuthResponse = useCallback(
    (response: LoginAuthenticationResponse): void => {
      setMfaEnrollRequired(!!response.mfaEnrollRequired);
      setEnrollQrCode(response.enrollQrCode);
      setEnrollMethods(response.allowedMfaMethods);
      setMfaRequired(!!response.mfaRequired);

      if (response.mfaRequired) {
        const methods = response.mfaMethods;
        setMfaMethods(methods);
        setMfaEmail(response.email);
        // When email is the only enrolled method, the server has already sent
        // the verification code, so show the code entry form directly.
        if (methods?.length === 1 && methods[0] === 'email') {
          setMfaEmailMode(true);
        }
      } else {
        setMfaMethods(undefined);
        setMfaEmail(undefined);
        setMfaEmailMode(false);
      }

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
          handleCode(response.code);
        }
      }
    },
    [chooseScopes, handleCode]
  );

  const requestEmailCode = useCallback(async (): Promise<void> => {
    if (!login) {
      return;
    }
    await medplum.post('auth/mfa/send-email', { login });
  }, [medplum, login]);

  const enrollEmail = useCallback((): void => {
    if (!login) {
      return;
    }
    medplum
      .post<LoginAuthenticationResponse>('auth/mfa/login-enroll', { login, method: 'email' })
      .then(handleAuthResponse)
      .catch((err: unknown) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [medplum, login, handleAuthResponse]);

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
        .catch((err: unknown) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    }
  }, [medplum, loginCode, loginRequested, login, handleAuthResponse]);

  return (
    <Document width={400} px="xl" py="xl" bdrs="md">
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
        } else if (mfaEnrollRequired) {
          return (
            <MfaEnrollForm
              allowedMethods={enrollMethods ?? ['totp']}
              qrCodeUrl={enrollQrCode}
              onEnrollEmail={enrollEmail}
              totpTitle="Enroll in MFA"
              totpDescription="Scan this QR code with your authenticator app."
              onEnrollTotp={async (token) => {
                const res = await medplum.post<LoginAuthenticationResponse>('auth/mfa/login-enroll', {
                  login: login,
                  method: 'totp',
                  token,
                });
                handleAuthResponse(res);
              }}
            />
          );
        } else if (mfaRequired) {
          return (
            <MfaVerificationForm
              methods={mfaMethods ?? []}
              email={mfaEmail}
              initialEmailMode={mfaEmailMode}
              onRequestEmailCode={requestEmailCode}
              onSubmit={async (token) => {
                const res = await medplum.post<LoginAuthenticationResponse>('auth/mfa/verify', {
                  login: login,
                  token,
                });
                handleAuthResponse(res);
              }}
            />
          );
        } else if (props.projectId === 'new') {
          return <NewProjectForm login={login} handleAuthResponse={handleAuthResponse} />;
        } else if (memberships) {
          return <ChooseProfileForm login={login} memberships={memberships} handleAuthResponse={handleAuthResponse} />;
        } else if (props.chooseScopes) {
          return <ChooseScopeForm login={login} scope={props.scope} handleAuthResponse={handleScopeResponse} />;
        } else {
          return <div>Success</div>;
        }
      })()}
    </Document>
  );
}
