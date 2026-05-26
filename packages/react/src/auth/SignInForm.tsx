// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Center, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { BaseLoginRequest, LoginAuthenticationResponse } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { ProjectMembership } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Document } from '../Document/Document';
import { Logo } from '../Logo/Logo';
import { AuthenticationForm } from './AuthenticationForm';
import { ChooseProfileForm } from './ChooseProfileForm';
import { ChooseScopeForm } from './ChooseScopeForm';
import { MfaForm } from './MfaForm';
import { NewProjectForm } from './NewProjectForm';

type MfaMethod = 'totp' | 'email';

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
  const [enrollSelected, setEnrollSelected] = useState<MfaMethod>();
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
      setEnrollMethods(response.allowedMfaMethods as MfaMethod[] | undefined);
      setMfaRequired(!!response.mfaRequired);

      if (response.mfaRequired) {
        const methods = response.mfaMethods as MfaMethod[] | undefined;
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

  const requestEmailCode = useCallback((): void => {
    if (!login) {
      return;
    }
    medplum
      .post('auth/mfa/send-email', { login })
      .then(() => setMfaEmailMode(true))
      .catch((err: unknown) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
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
          const emailEnrollAllowed = enrollMethods?.includes('email');
          const totpEnrollAllowed = !enrollMethods || enrollMethods.includes('totp');

          // When both methods are offered, let the user choose first.
          if (emailEnrollAllowed && totpEnrollAllowed && !enrollSelected) {
            return (
              <Center style={{ flexDirection: 'column' }}>
                <Logo size={32} />
                <Title order={3} py="lg">
                  Set up multi-factor authentication
                </Title>
                <Stack w="100%">
                  <Text c="dimmed" ta="center">
                    Choose how you want to verify your identity when you sign in.
                  </Text>
                  <Button fullWidth onClick={() => setEnrollSelected('totp')}>
                    Use an authenticator app (recommended)
                  </Button>
                  <Button fullWidth variant="default" onClick={enrollEmail}>
                    Continue with email-based MFA
                  </Button>
                </Stack>
              </Center>
            );
          }

          // Email-only project setting.
          if (emailEnrollAllowed && !totpEnrollAllowed) {
            return (
              <Center style={{ flexDirection: 'column' }}>
                <Logo size={32} />
                <Title order={3} py="lg">
                  Set up email-based MFA
                </Title>
                <Stack w="100%">
                  <Text c="dimmed" ta="center">
                    When you sign in, we&apos;ll email you a verification code to confirm your identity.
                  </Text>
                  <Button fullWidth onClick={enrollEmail}>
                    Enable email-based MFA
                  </Button>
                </Stack>
              </Center>
            );
          }

          // Default: authenticator (TOTP) enrollment via QR code.
          if (enrollQrCode) {
            return (
              <MfaForm
                title="Enroll in MFA"
                description="Scan this QR code with your authenticator app."
                buttonText="Enroll"
                qrCodeUrl={enrollQrCode}
                onSubmit={async (fields) => {
                  const res = await medplum.post<LoginAuthenticationResponse>('auth/mfa/login-enroll', {
                    login: login,
                    method: 'totp',
                    token: fields.token,
                  });
                  handleAuthResponse(res);
                }}
              />
            );
          }
          return null;
        } else if (mfaRequired) {
          let footer: ReactNode;
          if (mfaEmailMode) {
            footer = (
              <Anchor component="button" type="button" size="sm" ta="center" onClick={requestEmailCode}>
                Resend code
              </Anchor>
            );
          } else if (mfaMethods?.includes('email')) {
            footer = (
              <Anchor component="button" type="button" size="sm" ta="center" onClick={requestEmailCode}>
                Get a code by email instead
              </Anchor>
            );
          }
          return (
            <MfaForm
              title={mfaEmailMode ? 'Enter verification code' : 'Enter MFA code'}
              description={
                mfaEmailMode ? (
                  <>
                    Enter the 6-digit code we emailed to <strong>{mfaEmail}</strong>.
                  </>
                ) : (
                  'Enter the code from your authenticator app.'
                )
              }
              buttonText="Submit Code"
              onSubmit={async (fields) => {
                const res = await medplum.post<LoginAuthenticationResponse>('auth/mfa/verify', {
                  login: login,
                  token: fields.token,
                });
                handleAuthResponse(res);
              }}
              footer={footer}
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
