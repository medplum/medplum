// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { installValueSetStub } from './mockValueSet';

export interface WithValueSetStubProps {
  readonly children: ReactNode;
}

/**
 * Teaches the ambient Storybook client to expand the value sets these components bind to.
 *
 * Installed before the children render, so a bound field cannot probe the unpatched
 * client and take its example codes for the terminology.
 *
 * @param props - The React props.
 * @returns The children, once the stub is in place.
 */
export function WithValueSetStub(props: WithValueSetStubProps): JSX.Element | null {
  const medplum = useMedplum();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restore = installValueSetStub(medplum);
    setReady(true);
    return () => {
      setReady(false);
      restore();
    };
  }, [medplum]);

  return ready ? <>{props.children}</> : null;
}
