import { Title } from '@mantine/core';
import { Meta } from '@storybook/react';
import { RegisterForm } from '../auth/RegisterForm';
import { Logo } from '../Logo/Logo';

export default {
  title: 'Medplum/Auth/RegisterForm',
  component: RegisterForm,
} as Meta;

const recaptchaSiteKey = 'abc';

export function Basic(): JSX.Element {
  return (
    <RegisterForm type="project" recaptchaSiteKey={recaptchaSiteKey} onSuccess={() => alert('Registered!')}>
      <Logo size={32} />
      <Title>Register new account</Title>
    </RegisterForm>
  );
}

export function WithFooter(): JSX.Element {
  return (
    <>
      <RegisterForm type="project" recaptchaSiteKey={recaptchaSiteKey} onSuccess={() => alert('Registered!')}>
        <Logo size={32} />
        <Title>Register new account</Title>
      </RegisterForm>
    </>
  );
}

export function WithGoogle(): JSX.Element {
  return (
    <>
      <RegisterForm
        type="project"
        recaptchaSiteKey={recaptchaSiteKey}
        onSuccess={() => alert('Registered!')}
        googleClientId="xyz"
      >
        <Logo size={32} />
        <Title>Register new account</Title>
      </RegisterForm>
    </>
  );
}
