import { Meta } from '@storybook/react';
import React from 'react';
import { FooterLinks } from '../FooterLinks';
import { SignInForm } from '../SignInForm';

export default {
  title: 'Medplum/SignInForm',
  component: SignInForm,
} as Meta;

export function Basic(): JSX.Element {
  return <SignInForm onSuccess={() => alert('Signed in!')} />;
}

export function WithLinks(): JSX.Element {
  return (
    <SignInForm
      onSuccess={() => alert('Signed in!')}
      onForgotPassword={() => alert('Forgot password')}
      onRegister={() => alert('Register')}
    />
  );
}

export function WithFooter(): JSX.Element {
  return (
    <>
      <SignInForm
        onSuccess={() => alert('Signed in!')}
        onForgotPassword={() => alert('Forgot password')}
        onRegister={() => alert('Register')}
      />
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
      <SignInForm
        onSuccess={() => alert('Signed in!')}
        onForgotPassword={() => alert('Forgot password')}
        onRegister={() => alert('Register')}
        googleClientId="xyz"
      />
      <FooterLinks>
        <a href="#">Help</a>
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
      </FooterLinks>
    </>
  );
}
