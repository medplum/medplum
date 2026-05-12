// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { SetPasswordForm } from '../auth/SetPasswordForm';

export default {
  title: 'Medplum/Auth/SetPasswordForm',
  component: SetPasswordForm,
} as Meta;

export function Basic(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <SetPasswordForm
        id="example-id"
        secret="example-secret"
        onSuccess={() => alert('Password set!')}
        onSignIn={() => alert('Navigate to sign in')}
      />
    </div>
  );
}

export function NoSignInCallback(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <SetPasswordForm id="example-id" secret="example-secret" onSuccess={() => alert('Password set!')} />
    </div>
  );
}
