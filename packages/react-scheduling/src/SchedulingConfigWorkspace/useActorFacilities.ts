// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import type { ConfigurableActorResource } from '../configSearch';
import type { ActorFacilities } from './serviceFacilities';
import { resolveActorFacilities } from './serviceFacilities';

const NOTHING_PLACED: ReadonlyMap<string, ActorFacilities> = new Map();

/**
 * Finds where each actor is, for deciding which visit types can be booked with it.
 * @param actors - The providers, rooms, and devices to place.
 * @returns Where each actor is, keyed by its reference, or undefined while that is still being read.
 */
export function useActorFacilities(
  actors: readonly ConfigurableActorResource[]
): ReadonlyMap<string, ActorFacilities> | undefined {
  const medplum = useMedplum();
  const [resolved, setResolved] = useState<{ key: string; facilities: Map<string, ActorFacilities> }>();
  // Keyed on what placement reads, so an unrelated edit to an actor doesn't read it all again.
  const key = JSON.stringify(
    actors.map((actor) => [
      getReferenceString(actor),
      actor.resourceType === 'Location' ? actor.partOf?.reference : undefined,
      actor.resourceType === 'Device' ? actor.location?.reference : undefined,
    ])
  );
  const [tracked, setTracked] = useState({ key, actors });
  if (tracked.key !== key) {
    setTracked({ key, actors });
  }

  useEffect(() => {
    if (tracked.actors.length === 0) {
      return undefined;
    }
    const controller = new AbortController();
    resolveActorFacilities(medplum, tracked.actors, controller.signal)
      .then((facilities) => !controller.signal.aborted && setResolved({ key: tracked.key, facilities }))
      .catch(console.error);
    return () => controller.abort();
  }, [medplum, tracked]);

  if (actors.length === 0) {
    return NOTHING_PLACED;
  }
  return resolved?.key === key ? resolved.facilities : undefined;
}
