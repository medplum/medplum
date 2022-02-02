import { Logo, SignInForm } from '@medplum/ui';
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initGoogleAuth } from './utils';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();

  useEffect(() => {
    initGoogleAuth();
  }, []);

  return (
    <SignInForm
      onSuccess={() => navigate('/')}
      onForgotPassword={() => navigate('/resetpassword')}
      onRegister={() => navigate('/register')}
      googleClientId={process.env.GOOGLE_CLIENT_ID}
    >
      <Logo size={32} />
      <h1>Sign in to Medplum</h1>
    </SignInForm>
  );
}
