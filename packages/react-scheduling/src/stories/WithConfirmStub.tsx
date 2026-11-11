// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { installConfirmStub } from './mockConfirm';

export interface WithConfirmStubProps {
  readonly children: ReactNode;
}

/**
 * Teaches the ambient Storybook client to answer `Appointment/[id]/$confirm`.
 *
 * Installed before the children render, so a confirmation cannot reach the unpatched
 * client and fail for want of an operation.
 *
 * @param props - The React props.
 * @returns The children, once the stub is in place.
 */
export function WithConfirmStub(props: WithConfirmStubProps): JSX.Element | null {
  const medplum = useMedplum();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restore = installConfirmStub(medplum);
    setReady(true);
    return () => {
      setReady(false);
      restore();
    };
  }, [medplum]);

  return ready ? <>{props.children}</> : null;
}
