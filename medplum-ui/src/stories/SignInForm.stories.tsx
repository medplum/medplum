import { Meta } from '@storybook/react';
import { MedPlumClient } from 'medplum';
import React from 'react';
import { SignInForm, SignInFormProps } from '../SignInForm';

export default {
  title: 'MedPlum/SignInForm',
  component: SignInForm,
} as Meta;

const medplum = (window as any).medplum as MedPlumClient;

export const Basic = (args: SignInFormProps) => (
  <>
  <pre>User: {JSON.stringify(medplum.getUser())}</pre>
  <SignInForm onSuccess={() => alert('Success!')} />
  </>
);
