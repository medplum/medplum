// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { ResetPasswordForm } from '../auth/ResetPasswordForm';

export default {
  title: 'Medplum/Auth/ResetPasswordForm',
  component: ResetPasswordForm,
} as Meta;

export function Basic(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <ResetPasswordForm
        onSuccess={() => alert('Password reset email sent!')}
        onSignIn={() => alert('Navigate to sign in')}
        onRegister={() => alert('Navigate to register')}
      />
    </div>
  );
}

export function WithRecaptcha(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <ResetPasswordForm
        recaptchaSiteKey="abc"
        onSuccess={() => alert('Password reset email sent!')}
        onSignIn={() => alert('Navigate to sign in')}
      />
    </div>
  );
}

export function NoNavigation(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <ResetPasswordForm onSuccess={() => alert('Password reset email sent!')} />
    </div>
  );
}
