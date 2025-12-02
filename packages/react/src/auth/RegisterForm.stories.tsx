// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { RegisterForm } from '../auth/RegisterForm';
import { Logo } from '../Logo/Logo';

export default {
  title: 'Medplum/Auth/RegisterForm',
  component: RegisterForm,
} as Meta;

const recaptchaSiteKey = 'abc';

export function Basic(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <RegisterForm type="project" recaptchaSiteKey={recaptchaSiteKey} onSuccess={() => alert('Registered!')}>
        <Logo size={32} />
        <Title order={3} py="lg">
          Create a new account
        </Title>
      </RegisterForm>
    </div>
  );
}

export function WithFooter(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <RegisterForm type="project" recaptchaSiteKey={recaptchaSiteKey} onSuccess={() => alert('Registered!')}>
        <Logo size={32} />
        <Title order={3} py="lg">
          Create a new account
        </Title>
      </RegisterForm>
    </div>
  );
}

export function WithGoogle(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh' }}>
      <RegisterForm
        type="project"
        recaptchaSiteKey={recaptchaSiteKey}
        onSuccess={() => alert('Registered!')}
        googleClientId="xyz"
      >
        <Logo size={32} />
        <Title order={3} py="lg">
          Create a new account
        </Title>
      </RegisterForm>
    </div>
  );
}
