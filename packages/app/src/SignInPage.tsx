// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { getAppName, Logo, SignInForm, useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getConfig, isRegisterEnabled } from './config';

export function SignInPage(): JSX.Element {
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const config = getConfig();
  const projectId = searchParams.get('project') || undefined;
  const isCreatingNewProject = projectId === 'new';

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
        isRegisterEnabled() && !(profile && isCreatingNewProject)
          ? () => navigate('/register')?.catch(console.error)
          : undefined
      }
      googleClientId={config.googleClientId}
      login={searchParams.get('login') || undefined}
      projectId={projectId}
    >
      <Logo size={32} />
      {!isCreatingNewProject && (
        <Title order={3} py="lg" ta="center">
          Sign in to {getAppName()}
        </Title>
      )}
      {isCreatingNewProject && (
        <Title order={3} py="lg" ta="center">
          Sign in again to create a new project
        </Title>
      )}
    </SignInForm>
  );
}
