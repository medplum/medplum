import { useMedplum } from '@medplum/react';
import { useEffect } from 'react';

export function SignOutPage(): null {
  const medplum = useMedplum();

  useEffect(() => {
    medplum.signOut();
    window.location.href = '/';
  }, [medplum]);

  return null;
}
