import { Alert, Title } from '@mantine/core';
import { Document, Logo, RegisterForm, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function RegisterPage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();

  useEffect(() => {
    if (medplum.getProfile()) {
      navigate('/signin?project=new');
    }
  }, [medplum, navigate]);

  if (process.env.REGISTER_DISABLED) {
    return (
      <Document width={450}>
        <Alert icon={<IconAlertCircle size={16} />} title="New projects disabled" color="red">
          {process.env.REGISTER_DISABLED_MESSAGE}
        </Alert>
      </Document>
    );
  }

  return (
    <RegisterForm
      type="project"
      onSuccess={() => navigate('/')}
      googleClientId={process.env.GOOGLE_CLIENT_ID}
      recaptchaSiteKey={process.env.RECAPTCHA_SITE_KEY as string}
    >
      <Logo size={32} />
      <Title>Create a new account</Title>
    </RegisterForm>
  );
}
