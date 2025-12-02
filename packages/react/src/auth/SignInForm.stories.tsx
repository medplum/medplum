// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Logo } from '../Logo/Logo';
import { getAppName } from '../utils/app';
import { SignInForm } from './SignInForm';

export default {
  title: 'Medplum/Auth/SignInForm',
  component: SignInForm,
} as Meta;

export function Basic(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <SignInForm onSuccess={() => alert('Signed in!')}>
        <Logo size={32} />
        <Title order={3} py="lg">
          Sign in to {getAppName()}
        </Title>
      </SignInForm>
    </div>
  );
}

export function WithLinks(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <SignInForm
        onSuccess={() => alert('Signed in!')}
        onForgotPassword={() => alert('Forgot password')}
        onRegister={() => alert('Register')}
      >
        <Logo size={32} />
        <h2>Sign in to {getAppName()}</h2>
      </SignInForm>
    </div>
  );
}

export function WithFooter(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <SignInForm
        onSuccess={() => alert('Signed in!')}
        onForgotPassword={() => alert('Forgot password')}
        onRegister={() => alert('Register')}
      >
        <Logo size={32} />
        <h2>Sign in to {getAppName()}</h2>
      </SignInForm>
    </div>
  );
}

export function WithGoogle(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <SignInForm
        onSuccess={() => alert('Signed in!')}
        onForgotPassword={() => alert('Forgot password')}
        onRegister={() => alert('Register')}
        googleClientId="xyz"
      >
        <Logo size={32} />
        <h2>Sign in to {getAppName()}</h2>
      </SignInForm>
    </div>
  );
}

export function GoogleOnly(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <SignInForm
        onSuccess={() => alert('Signed in!')}
        onForgotPassword={() => alert('Forgot password')}
        googleClientId="xyz"
        disableEmailAuth
      >
        <Logo size={32} />
        <h2>Sign in to {getAppName()}</h2>
      </SignInForm>
    </div>
  );
}
