import { Meta } from '@storybook/react';
import React from 'react';
import { Button } from '../Button';
import { useAuth } from '../MedPlumProvider';
import { SignInForm, SignInFormProps } from '../SignInForm';

export default {
  title: 'MedPlum/SignInForm',
  component: SignInForm,
} as Meta;

export function Basic(args: SignInFormProps) {
  const auth = useAuth();
  return (auth.user ? (
    <div>
      <pre>User: {JSON.stringify(auth.user)}</pre>
      <Button onClick={() => auth.medplum.signOut().then(() => alert('Signed out!'))}>
        Sign out
      </Button>
    </div>
  ) : (
    <SignInForm onSuccess={() => alert('Signed in!')} />
  ));
}
