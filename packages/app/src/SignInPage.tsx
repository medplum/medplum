import { SignInForm } from '@medplum/ui';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export function SignInPage() {
  const navigate = useNavigate();
  return (
    <SignInForm
      onSuccess={() => navigate('/')}
      onForgotPassword={() => navigate('/resetpassword')}
      onRegister={() => navigate('/register')}
      googleClientId={process.env.GOOGLE_CLIENT_ID}
    />
  );
}
