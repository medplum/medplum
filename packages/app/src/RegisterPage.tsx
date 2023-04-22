import { Alert, Title } from '@mantine/core';
import { Document, Logo, RegisterForm, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConfig } from './config';

export function RegisterPage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const config = getConfig();

  useEffect(() => {
    if (medplum.getProfile()) {
      navigate('/signin?project=new');
    }
  }, [medplum, navigate]);

  if (!config.registerEnabled) {
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
      onSuccess={() => navigate('/')}
      googleClientId={config.googleClientId}
      recaptchaSiteKey={config.recaptchaSiteKey}
    >
      <Logo size={32} />
      <Title>Create a new account</Title>
    </RegisterForm>
  );
}
