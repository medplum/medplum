// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { FindStubOptions } from './mockFind';
import { installFindStub } from './mockFind';

export interface WithFindStubProps extends FindStubOptions {
  readonly children: ReactNode;
}

/**
 * Teaches the ambient Storybook client to answer `Appointment/$find`.
 *
 * Installed before the children render, so the first search cannot reach the
 * unpatched client and come back empty.
 *
 * @param props - The React props.
 * @returns The children, once the stub is in place.
 */
export function WithFindStub(props: WithFindStubProps): JSX.Element | null {
  const medplum = useMedplum();
  const { empty } = props;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restore = installFindStub(medplum, { empty });
    setReady(true);
    return () => {
      setReady(false);
      restore();
    };
  }, [medplum, empty]);

  return ready ? <>{props.children}</> : null;
}
