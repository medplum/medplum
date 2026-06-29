// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Title } from '@mantine/core';
import { Document, Logo, RegisterForm, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

export function RegisterPage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (medplum.getProfile()) {
      navigate('/signin?project=new')?.catch(console.error);
    }
  }, [medplum, navigate]);

  if (import.meta.env.MEDPLUM_REGISTER_ENABLED !== 'true') {
    return (
      <Document width={450}>
        <Alert icon={<IconAlertCircle size={16} />} title="New projects disabled" color="red">
          New projects are disabled on this server.
        </Alert>
      </Document>
    );
  }

  return (
    <RegisterForm
      type="project"
      projectId="new"
      onSuccess={() => {
        // Use window.location.href to force a reload
        // Otherwise we get caught in a React render loop
        window.location.href = '/';
      }}
      googleClientId={import.meta.env.GOOGLE_CLIENT_ID}
      recaptchaSiteKey={import.meta.env.RECAPTCHA_SITE_KEY}
      login={searchParams.get('login') || undefined}
    >
      <Logo size={32} />
      <Title order={3} py="lg">
        Register a new Provider account
      </Title>
    </RegisterForm>
  );
}
