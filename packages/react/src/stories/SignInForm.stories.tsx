import { Text } from '@mantine/core';
import { Meta } from '@storybook/react';
import React from 'react';
import { SignInForm } from '../auth/SignInForm';
import { Logo } from '../Logo';

export default {
  title: 'Medplum/SignInForm',
  component: SignInForm,
} as Meta;

export function Basic(): JSX.Element {
  return (
    <SignInForm onSuccess={() => alert('Signed in!')}>
      <Logo size={32} />
      <Text size="lg" weight={500}>
        Sign in to Medplum
      </Text>
    </SignInForm>
  );
}

export function WithLinks(): JSX.Element {
  return (
    <SignInForm
      onSuccess={() => alert('Signed in!')}
      onForgotPassword={() => alert('Forgot password')}
      onRegister={() => alert('Register')}
    >
      <Logo size={32} />
      <Text size="lg" weight={500}>
        Sign in to Medplum
      </Text>
    </SignInForm>
  );
}

export function WithFooter(): JSX.Element {
  return (
    <>
      <SignInForm
        onSuccess={() => alert('Signed in!')}
        onForgotPassword={() => alert('Forgot password')}
        onRegister={() => alert('Register')}
      >
        <Logo size={32} />
        <Text size="lg" weight={500}>
          Sign in to Medplum
        </Text>
      </SignInForm>
    </>
  );
}

export function WithGoogle(): JSX.Element {
  return (
    <>
      <SignInForm
        onSuccess={() => alert('Signed in!')}
        onForgotPassword={() => alert('Forgot password')}
        onRegister={() => alert('Register')}
        googleClientId="xyz"
      >
        <Logo size={32} />
        <Text size="lg" weight={500}>
          Sign in to Medplum
        </Text>
      </SignInForm>
    </>
  );
}
