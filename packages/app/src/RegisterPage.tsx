// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Title } from '@mantine/core';
import { Document, Logo, RegisterForm, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { JSX, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getConfig, isRegisterEnabled } from './config';

export function RegisterPage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const config = getConfig();

  useEffect(() => {
    if (medplum.getProfile()) {
      navigate('/signin?project=new')?.catch(console.error);
    }
  }, [medplum, navigate]);

  if (!isRegisterEnabled()) {
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
      googleClientId={config.googleClientId}
      recaptchaSiteKey={config.recaptchaSiteKey}
    >
      <Logo size={32} />
      <Title>Create a new account</Title>
    </RegisterForm>
  );
}
