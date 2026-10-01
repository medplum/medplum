// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import type { HealthcareService, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookableActorType } from '../actors';
import type { ConfigSearchOptions, ConfigurableActor } from '../configSearch';
import { searchConfigurableActors, searchConfigurableServices } from '../configSearch';
import { withStoredService } from './SchedulingConfigWorkspace.utils';

/** One section's read. */
export interface ResourceList<T> {
  readonly items: readonly T[];
  readonly loading: boolean;
  /** False when the project holds more than the one page read. */
  readonly complete: boolean;
  /** Why the read failed, when it did. */
  readonly error?: unknown;
}

export interface ConfigurableResources {
  readonly services: ResourceList<WithId<HealthcareService>>;
  readonly actors: Record<BookableActorType, ResourceList<ConfigurableActor>>;
  /** Puts resources the server now holds into the lists, in place of what they were loaded as. */
  readonly store: (resources: readonly WithId<Resource>[]) => void;
}

type ReadList<T> = (
  medplum: MedplumClient,
  options: ConfigSearchOptions
) => Promise<{ readonly items: readonly T[]; readonly complete: boolean }>;

const LOADING: ResourceList<never> = { items: [], loading: true, complete: true };

// At module scope, since each read is an effect dependency.
const READ_ACTORS = {
  Practitioner: (medplum, options) => searchConfigurableActors(medplum, 'Practitioner', options),
  Location: (medplum, options) => searchConfigurableActors(medplum, 'Location', options),
  Device: (medplum, options) => searchConfigurableActors(medplum, 'Device', options),
} satisfies Record<BookableActorType, ReadList<ConfigurableActor>>;

/**
 * Reads the visit types, providers, rooms, and devices the configuration workspace lists, one search per
 * section so that each fails on its own, and lays whatever the workspace has saved since over what was read.
 * @returns The sections as read, and a way to store what the workspace saves.
 */
export function useConfigurableResources(): ConfigurableResources {
  const services = useResourceList(searchConfigurableServices);
  const practitioners = useResourceList(READ_ACTORS.Practitioner);
  const locations = useResourceList(READ_ACTORS.Location);
  const devices = useResourceList(READ_ACTORS.Device);
  // Laid over each read, so a save made while a read was in flight isn't lost when the older result lands.
  const [saved, setSaved] = useState<readonly WithId<Resource>[]>([]);

  const store = useCallback((resources: readonly WithId<Resource>[]): void => {
    setSaved((current) => [...current, ...resources]);
  }, []);

  return useMemo((): ConfigurableResources => {
    const items = saved.reduce(
      (list, resource) => (resource.resourceType === 'HealthcareService' ? withStoredService(list, resource) : list),
      services.items
    );
    return {
      services: { ...services, items },
      actors: { Practitioner: practitioners, Location: locations, Device: devices },
      store,
    };
  }, [services, practitioners, locations, devices, saved, store]);
}

function useResourceList<T>(read: ReadList<T>): ResourceList<T> {
  const medplum = useMedplum();
  const [list, setList] = useState<ResourceList<T>>(LOADING);

  useEffect(() => {
    const controller = new AbortController();
    read(medplum, { signal: controller.signal })
      .then(({ items, complete }) => !controller.signal.aborted && setList({ items, complete, loading: false }))
      .catch(
        (error: unknown) => !controller.signal.aborted && setList({ items: [], complete: true, loading: false, error })
      );
    return () => controller.abort();
  }, [medplum, read]);

  return list;
}
