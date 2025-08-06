// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react';
import { useEffect } from 'react';

export function SignOutPage(): null {
  const medplum = useMedplum();

  useEffect(() => {
    medplum
      .signOut()
      .then(() => {
        window.location.href = '/';
      })
      .catch(console.error);
  }, [medplum]);

  return null;
}
