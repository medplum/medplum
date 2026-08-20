// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MockClient } from '@medplum/mock';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { stubChainedActorSearch } from '../test-utils/chainedActorSearch';

export interface WithChainedActorSearchProps {
  readonly children: ReactNode;
}

/**
 * Teaches the ambient Storybook client to answer the chained `actor:` filters.
 *
 * The role fields find their schedules through `actor:Practitioner.name` and its
 * siblings. `MemoryRepository` looks a filter's code up in the flat search
 * parameter table, so a chained one matches nothing — and returns an empty
 * bundle rather than an error, which reads as a visit type with nothing
 * configured. Installed before the children render, so the first search cannot
 * reach the unpatched client and come back empty.
 *
 * @param props - The React props.
 * @returns The children, once the stub is in place.
 */
export function WithChainedActorSearch(props: WithChainedActorSearchProps): JSX.Element | null {
  const medplum = useMedplum();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The preview's ambient client is a MockClient, which is what the stub patches.
    const restore = stubChainedActorSearch(medplum as MockClient);
    setReady(true);
    return () => {
      setReady(false);
      restore();
    };
  }, [medplum]);

  return ready ? <>{props.children}</> : null;
}
