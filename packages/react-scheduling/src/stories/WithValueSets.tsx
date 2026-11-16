// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { installValueSetStub } from './mockValueSet';

export interface WithValueSetsProps {
  /** Concepts to offer, keyed by the value set's canonical url. */
  readonly valueSets: Record<string, Coding[]>;
  readonly children: ReactNode;
}

/**
 * Teaches the ambient Storybook client to expand a fixed set of value sets.
 *
 * Installed before the children render, so a field cannot probe the unpatched client and settle on
 * a verdict about a value set this was about to supply.
 *
 * @param props - The React props.
 * @param props.valueSets - Concepts to offer, keyed by the value set's canonical url.
 * @param props.children - What renders once the stub is in place.
 * @returns The children, once the stub is in place.
 */
export function WithValueSets(props: WithValueSetsProps): JSX.Element | null {
  const medplum = useMedplum();
  const [ready, setReady] = useState(false);
  const { valueSets } = props;

  useEffect(() => {
    const restore = installValueSetStub(medplum, valueSets);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- children must not mount until the stub is installed
    setReady(true);
    return () => {
      setReady(false);
      restore();
    };
  }, [medplum, valueSets]);

  return ready ? <>{props.children}</> : null;
}
