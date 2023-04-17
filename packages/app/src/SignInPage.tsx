import { Title } from '@mantine/core';
import { Logo, SignInForm } from '@medplum/react';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <SignInForm
      onSuccess={() => navigate(searchParams.get('next') || '/')}
      onForgotPassword={() => navigate('/resetpassword')}
      onRegister={process.env.REGISTER_ENABLED === 'false' ? undefined : () => navigate('/register')}
      googleClientId={process.env.GOOGLE_CLIENT_ID || undefined}
      login={searchParams.get('login') || undefined}
      projectId={searchParams.get('project') || undefined}
    >
      <Logo size={32} />
      <Title>Sign in to Medplum</Title>
      {searchParams.get('project') == 'new' && <div>Sign in again to create a new project</div>}
    </SignInForm>
  );
}
