import { Document, SignInForm } from '@medplum/ui';
import React from 'react';
import { history } from './history';

export function SignInPage() {
  return (
    <Document width={450}>
      <SignInForm
        onSuccess={() => history.push('/')}
      />
    </Document>
  );
}
