import { Title } from '@mantine/core';
import { Logo, SignInForm } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

export default function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <SignInForm
      // Configure according to your settings
      googleClientId="397236612778-c0b5tnjv98frbo1tfuuha5vkme3cmq4s.apps.googleusercontent.com"
      onSuccess={() => navigate('/')}
    >
      <Logo size={32} />
      <Title ta="center">Sign in to Medplum</Title>
    </SignInForm>
  );
}
