import { Logo, RegisterForm, useMedplum } from '@medplum/react';
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

  return (
    <RegisterForm
      type="project"
      onSuccess={() => navigate('/')}
      googleClientId={process.env.GOOGLE_CLIENT_ID}
      recaptchaSiteKey={process.env.RECAPTCHA_SITE_KEY as string}
    >
      <Logo size={32} />
      <h1>Create a new account</h1>
    </RegisterForm>
  );
}
