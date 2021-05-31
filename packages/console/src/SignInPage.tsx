import { Document, SignInForm } from '@medplum/ui';
import React from 'react';
import { history } from './history';

export function SignInPage() {
  return (
    <Document>
      <SignInForm
        onSuccess={() => history.push('/')}
      />
    </Document>
  );
}
