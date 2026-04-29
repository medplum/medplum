// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { ChangePasswordForm } from '../auth/ChangePasswordForm';

export default {
  title: 'Medplum/Auth/ChangePasswordForm',
  component: ChangePasswordForm,
} as Meta;

export function Basic(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <ChangePasswordForm onSuccess={() => alert('Password changed!')} />
    </div>
  );
}
