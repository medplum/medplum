// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { SignInForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { LyfeLogo } from '../components/brand/LyfeLogo';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <SignInForm
      // Configure according to your settings
      googleClientId={import.meta.env.GOOGLE_CLIENT_ID}
      clientId={import.meta.env.MEDPLUM_CLIENT_ID}
      onSuccess={() => navigate('/')?.catch(console.error)}
      onRegister={
        import.meta.env.MEDPLUM_REGISTER_ENABLED === 'true'
          ? () => navigate('/register')?.catch(console.error)
          : undefined
      }
      projectId={searchParams.get('project') || undefined}
      login={searchParams.get('login') || undefined}
    >
      <LyfeLogo size={32} />
      <Title order={3} py="lg">
        Sign in to LyfeAI
      </Title>
    </SignInForm>
  );
}
