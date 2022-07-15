import { Meta } from '@storybook/react';
import React from 'react';
import { FooterLinks } from '../FooterLinks';
import { Logo } from '../Logo';
import { RegisterForm } from '../RegisterForm';

export default {
  title: 'Medplum/RegisterForm',
  component: RegisterForm,
} as Meta;

export function Basic(): JSX.Element {
  return (
    <RegisterForm type="project" onSuccess={() => alert('Signed in!')}>
      <Logo size={32} />
      <h1>Register new account</h1>
    </RegisterForm>
  );
}

export function WithFooter(): JSX.Element {
  return (
    <>
      <RegisterForm type="project" onSuccess={() => alert('Signed in!')}>
        <Logo size={32} />
        <h1>Register new account</h1>
      </RegisterForm>
      <FooterLinks>
        <a href="#">Help</a>
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
      </FooterLinks>
    </>
  );
}

export function WithGoogle(): JSX.Element {
  return (
    <>
      <RegisterForm type="project" onSuccess={() => alert('Signed in!')} googleClientId="xyz">
        <Logo size={32} />
        <h1>Register new account</h1>
      </RegisterForm>
      <FooterLinks>
        <a href="#">Help</a>
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
      </FooterLinks>
    </>
  );
}
