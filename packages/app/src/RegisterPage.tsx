import { Logo, RegisterForm } from '@medplum/react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <RegisterForm type="project" onSuccess={() => navigate('/')} googleClientId={process.env.GOOGLE_CLIENT_ID}>
      <Logo size={32} />
      <h1>Create a new account</h1>
    </RegisterForm>
  );
}
