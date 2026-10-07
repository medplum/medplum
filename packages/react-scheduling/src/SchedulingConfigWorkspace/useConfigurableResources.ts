// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookableActorType } from '../actors';
import { BOOKABLE_ACTOR_TYPES } from '../actors';
import type { ConfigurableActor } from '../configSearch';
import { searchConfigurableActors, searchConfigurableServices } from '../configSearch';
import { withStoredActorResource, withStoredService } from './SchedulingConfigWorkspace.utils';

/** One section's read. */
export interface ResourceList<T> {
  readonly items: readonly T[];
  readonly loading: boolean;
  /** False when the project holds more than the one page read. */
  readonly complete: boolean;
  readonly error?: unknown;
}

/** The providers, rooms, and devices, one list per actor type. */
export type ActorLists = Record<BookableActorType, ResourceList<ConfigurableActor>>;

export interface ConfigurableResources {
  readonly services: ResourceList<WithId<HealthcareService>>;
  readonly actors: ActorLists;
  /** Puts resources the server now holds into the lists, in place of what they were loaded as. */
  readonly store: (resources: readonly WithId<Resource>[]) => void;
}

const LOADING: ResourceList<never> = { items: [], loading: true, complete: true };
const ACTORS_LOADING: ActorLists = { Practitioner: LOADING, Location: LOADING, Device: LOADING };

/**
 * Reads the visit types, providers, rooms, and devices the configuration workspace lists, one search per
 * section so that each fails on its own, and lays whatever the workspace has saved since over what was read.
 * @returns The sections as read, and a way to store what the workspace saves.
 */
export function useConfigurableResources(): ConfigurableResources {
  const medplum = useMedplum();
  const [services, setServices] = useState<ResourceList<WithId<HealthcareService>>>(LOADING);
  const [actors, setActors] = useState<ActorLists>(ACTORS_LOADING);
  // Laid over each read, so a save made while a read was in flight isn't lost when the older result lands.
  const [saved, setSaved] = useState<readonly WithId<Resource>[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    function settle<T>(
      read: Promise<{ items: readonly T[]; complete: boolean }>,
      set: (list: ResourceList<T>) => void
    ): void {
      read
        .then(({ items, complete }) => !controller.signal.aborted && set({ items, complete, loading: false }))
        .catch(
          (error: unknown) => !controller.signal.aborted && set({ items: [], complete: true, loading: false, error })
        );
    }
    settle(
      searchConfigurableServices(medplum, options).then((result) => ({
        items: result.services,
        complete: result.complete,
      })),
      setServices
    );
    for (const resourceType of BOOKABLE_ACTOR_TYPES) {
      settle(
        searchConfigurableActors(medplum, resourceType, options).then((result) => ({
          items: result.actors,
          complete: result.complete,
        })),
        (list) => setActors((current) => ({ ...current, [resourceType]: list }))
      );
    }
    return () => controller.abort();
  }, [medplum]);

  const store = useCallback((resources: readonly WithId<Resource>[]): void => {
    setSaved((current) => [...current, ...resources]);
  }, []);

  return useMemo((): ConfigurableResources => {
    const items = saved.reduce(
      (list, resource) => (resource.resourceType === 'HealthcareService' ? withStoredService(list, resource) : list),
      services.items
    );
    const withSaved = (list: ResourceList<ConfigurableActor>): ResourceList<ConfigurableActor> => ({
      ...list,
      items: saved.reduce((actorItems, resource) => withStoredActorResource(actorItems, resource), list.items),
    });
    return {
      services: { ...services, items },
      actors: {
        Practitioner: withSaved(actors.Practitioner),
        Location: withSaved(actors.Location),
        Device: withSaved(actors.Device),
      },
      store,
    };
  }, [services, actors, saved, store]);
}
