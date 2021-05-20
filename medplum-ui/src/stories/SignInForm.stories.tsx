import { Meta } from '@storybook/react';
import React from 'react';
import { Button } from '../Button';
import { Document } from '../Document';
import { useMedplumContext } from '../MedplumProvider';
import { SignInForm } from '../SignInForm';

export default {
  title: 'Medplum/SignInForm',
  component: SignInForm,
} as Meta;

export function Basic() {
  const ctx = useMedplumContext();
  return (
    <Document>
      {ctx.user ? (
        <div>
          <pre>User: {JSON.stringify(ctx.user)}</pre>
          <Button onClick={() => ctx.medplum.signOut().then(() => alert('Signed out!'))}>
            Sign out
      </Button>
        </div>
      ) : (
        <SignInForm onSuccess={() => alert('Signed in!')} />
      )}
    </Document>
  );
}
