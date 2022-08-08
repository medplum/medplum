import { Logo, SignInForm } from '@medplum/react';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <SignInForm
      onSuccess={() => navigate('/')}
      onForgotPassword={() => navigate('/resetpassword')}
      onRegister={() => navigate('/register')}
      googleClientId={process.env.GOOGLE_CLIENT_ID}
      projectId={searchParams.get('project') as string | undefined}
    >
      <Logo size={32} />
      <h1>Sign in to Medplum</h1>
    </SignInForm>
  );
}
