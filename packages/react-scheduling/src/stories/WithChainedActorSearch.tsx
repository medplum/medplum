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
 * The in-memory repository answers them with an empty bundle rather than an error,
 * so the stub goes in before the children render: a search that beats it looks like
 * a story with no fixtures.
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
