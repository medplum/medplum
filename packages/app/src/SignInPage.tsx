import { Title } from '@mantine/core';
import { Logo, SignInForm, useMedplum } from '@medplum/react';
import React, { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getConfig, isRegisterEnabled } from './config';

export function SignInPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const config = getConfig();

  const navigateToNext = useCallback(() => {
    // only redirect to next if it is a pathname to avoid redirecting
    // to a maliciously crafted URL, e.g. /signin?next=https%3A%2F%2Fevil.com
    const nextUrl = searchParams.get('next');
    navigate(nextUrl?.startsWith('/') ? nextUrl : '/');
  }, [searchParams, navigate]);

  useEffect(() => {
    if (medplum.getProfile()) {
      navigateToNext();
    }
  }, [medplum, navigateToNext]);

  return (
    <SignInForm
      onSuccess={() => navigateToNext()}
      onForgotPassword={() => navigate('/resetpassword')}
      onRegister={isRegisterEnabled() ? () => navigate('/register') : undefined}
      googleClientId={config.googleClientId}
      login={searchParams.get('login') || undefined}
      projectId={searchParams.get('project') || undefined}
    >
      <Logo size={32} />
      <Title>Sign in to Medplum</Title>
      {searchParams.get('project') === 'new' && <div>Sign in again to create a new project</div>}
    </SignInForm>
  );
}
