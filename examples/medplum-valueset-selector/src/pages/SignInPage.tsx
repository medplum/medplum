import { Title } from '@mantine/core';
import { Logo, SignInForm } from '@medplum/react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <SignInForm
      // Configure according to your settings
      onSuccess={() => navigate('/')?.catch(console.error)}
    >
      <Logo size={32} />
      <Title>Sign in to Medplum</Title>
    </SignInForm>
  );
}
