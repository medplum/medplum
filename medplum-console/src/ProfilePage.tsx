import { Document, useMedplumContext } from 'medplum-ui';
import React from 'react';

export function ProfilePage() {
  const auth = useMedplumContext();

  return (
    <Document>
      <pre>{JSON.stringify(auth.user, undefined, 2)}</pre>
    </Document>
  );
}
