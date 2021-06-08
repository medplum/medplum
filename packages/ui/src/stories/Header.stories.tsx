import { Meta } from '@storybook/react';
import React from 'react';
import { Header, HeaderProps } from '../Header';
import { useMedplumContext } from '../MedplumProvider';

export default {
  title: 'Medplum/Header',
  component: Header,
} as Meta;

export const Basic = (args: HeaderProps) => {
  const ctx = useMedplumContext();
  return (
    <Header
      onLogo={() => alert('Logo!')}
      onProfile={() => alert('Profile!')}
      onRegister={() => alert('Register!')}
      onSignIn={() => alert('Sign in!')}
      onSignOut={() => {
        alert('Sign out!');
        ctx.medplum.signOut();
      }}
      {...args}
    />
  );
};