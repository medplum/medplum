// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { Logo, SignInForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <SignInForm
      googleClientId={import.meta.env.GOOGLE_CLIENT_ID}
      clientId={import.meta.env.MEDPLUM_CLIENT_ID}
      onSuccess={() => navigate('/')?.catch(console.error)}
    >
      <Logo size={32} />
      <Title>Sign in to Medplum</Title>
    </SignInForm>
  );
}
