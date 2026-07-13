// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { getAppName, Logo, SignInForm, useMedplum, useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getConfig, isRegisterEnabled } from './config';

export function SignInPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const config = getConfig();

  const navigateToNext = useCallback(() => {
    // only redirect to next if it is a pathname to avoid redirecting
    // to a maliciously crafted URL, e.g. /signin?next=https%3A%2F%2Fevil.com
    const nextUrl = searchParams.get('next');
    navigate(nextUrl?.startsWith('/') ? nextUrl : '/')?.catch(console.error);
  }, [searchParams, navigate]);

  useEffect(() => {
    if (profile && searchParams.has('next')) {
      navigateToNext();
    }
  }, [profile, searchParams, navigateToNext]);

  return (
    <SignInForm
      onSuccess={() => navigateToNext()}
      onForgotPassword={() => navigate('/resetpassword')?.catch(console.error)}
      onRegister={
        isRegisterEnabled()
          ? async () => {
              // Sign out before navigating to RegisterPage so it does not
              // redirect us back to /signin?project=new. If the server logout
              // fails, still clear local auth state so the Register page loads.
              await medplum.signOut().catch(() => medplum.clear());
              navigate('/register')?.catch(console.error);
            }
          : undefined
      }
      googleClientId={config.googleClientId}
      login={searchParams.get('login') || undefined}
      projectId={searchParams.get('project') || undefined}
    >
      <Logo size={32} />
      {searchParams.get('project') !== 'new' && (
        <Title order={3} py="lg" ta="center">
          Sign in to {getAppName()}
        </Title>
      )}
      {searchParams.get('project') === 'new' && (
        <Title order={3} py="lg" ta="center">
          Sign in again to create a new project
        </Title>
      )}
    </SignInForm>
  );
}
