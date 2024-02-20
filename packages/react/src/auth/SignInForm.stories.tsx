import { Title } from '@mantine/core';
import { Meta } from '@storybook/react';
import { SignInForm } from './SignInForm';
import { Logo } from '../Logo/Logo';

export default {
  title: 'Medplum/Auth/SignInForm',
  component: SignInForm,
} as Meta;

export function Basic(): JSX.Element {
  return (
    <SignInForm onSuccess={() => alert('Signed in!')}>
      <Logo size={32} />
      <Title>Sign in to Medplum</Title>
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
      <Title>Sign in to Medplum</Title>
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
        <Title>Sign in to Medplum</Title>
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
        <Title>Sign in to Medplum</Title>
      </SignInForm>
    </>
  );
}

export function GoogleOnly(): JSX.Element {
  return (
    <>
      <SignInForm
        onSuccess={() => alert('Signed in!')}
        onForgotPassword={() => alert('Forgot password')}
        googleClientId="xyz"
        disableEmailAuth
      >
        <Logo size={32} />
        <Title>Sign in to Medplum</Title>
      </SignInForm>
    </>
  );
}
