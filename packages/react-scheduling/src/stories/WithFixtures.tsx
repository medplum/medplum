// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { indexSchedulingSearchParameters } from './searchParameters';

export interface WithFixturesProps {
  readonly resources: readonly Resource[];
  readonly children: ReactNode;
}

/**
 * Seeds the ambient Storybook client and renders its children once the resources are in place.
 *
 * Stored before the children render so that the first focus, which is what sends the
 * fields searching, cannot beat the fixtures there.
 *
 * @param props - The React props.
 * @param props.resources - What to store first.
 * @param props.children - What to render once the resources are stored.
 * @returns The children, or nothing while the resources are being stored.
 */
export function WithFixtures(props: WithFixturesProps): JSX.Element | null {
  const medplum = useMedplum();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Storing the resources is only half of it: MockClient still needs the
    // search parameters registered before it can find any of them again.
    indexSchedulingSearchParameters();
    Promise.all(props.resources.map((resource) => medplum.updateResource(resource)))
      .then(() => setReady(true))
      .catch(console.error);
  }, [medplum, props.resources]);

  return ready ? <>{props.children}</> : null;
}
