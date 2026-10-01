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
import { withStoredService } from './SchedulingConfigWorkspace.utils';

/** One section's read. */
export interface ResourceList<T> {
  readonly items: readonly T[];
  readonly loading: boolean;
  /** False when the project holds more than the one page read. */
  readonly complete: boolean;
  readonly error?: unknown;
}

export interface ConfigurableResources {
  readonly services: ResourceList<WithId<HealthcareService>>;
  readonly actors: Record<BookableActorType, ResourceList<ConfigurableActor>>;
  /** Puts saved visit types into the list in place of what was loaded. Other resources are ignored. */
  readonly store: (resources: readonly WithId<Resource>[]) => void;
}

const LOADING: ResourceList<never> = { items: [], loading: true, complete: true };

/**
 * Reads the visit types, providers, rooms, and devices the configuration workspace lists, one search per
 * section so that each fails on its own, and lays whatever the workspace has saved since over what was read.
 * @returns The sections as read, and a way to store what the workspace saves.
 */
export function useConfigurableResources(): ConfigurableResources {
  const medplum = useMedplum();
  const [services, setServices] = useState<ResourceList<WithId<HealthcareService>>>(LOADING);
  const [actors, setActors] = useState<Record<BookableActorType, ResourceList<ConfigurableActor>>>({
    Practitioner: LOADING,
    Location: LOADING,
    Device: LOADING,
  });
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
    return { services: { ...services, items }, actors, store };
  }, [services, actors, saved, store]);
}
