import { Title } from '@mantine/core';
import { Logo, SignInForm } from '@medplum/react';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getConfig } from './config';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const config = getConfig();

  return (
    <SignInForm
      onSuccess={() => navigate(searchParams.get('next') || '/')}
      onForgotPassword={() => navigate('/resetpassword')}
      onRegister={config.registerEnabled ? () => navigate('/register') : undefined}
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
