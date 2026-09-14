// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { installBookStub } from './mockBook';

export interface WithBookStubProps {
  readonly children: ReactNode;
}

/**
 * Teaches the ambient Storybook client to answer `Appointment/$book`.
 *
 * Installed before the children render, so a booking cannot reach the unpatched
 * client and fail for want of an operation.
 *
 * @param props - The React props.
 * @returns The children, once the stub is in place.
 */
export function WithBookStub(props: WithBookStubProps): JSX.Element | null {
  const medplum = useMedplum();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restore = installBookStub(medplum);
    setReady(true);
    return () => {
      setReady(false);
      restore();
    };
  }, [medplum]);

  return ready ? <>{props.children}</> : null;
}
