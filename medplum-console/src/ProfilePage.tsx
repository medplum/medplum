import { Document, useAuth } from 'medplum-ui';
import React from 'react';

export function ProfilePage() {
  const auth = useAuth();

  return (
    <Document>
      <pre>{JSON.stringify(auth.user, undefined, 2)}</pre>
    </Document>
  );
}
