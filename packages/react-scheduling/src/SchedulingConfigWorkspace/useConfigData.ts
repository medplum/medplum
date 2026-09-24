// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Device, HealthcareService, Location, Practitioner, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConfigSearchOptions, ConfigurableActor } from '../configSearch';
import { searchConfigurableActors, searchConfigurableCalendars, searchConfigurableServices } from '../configSearch';
import { mergeActors, withStoredActorResource, withStoredService } from './SchedulingConfigWorkspace.utils';

/** One section's read. */
export interface ConfigList<T> {
  readonly items: readonly T[];
  readonly loading: boolean;
  /** False when the read stopped at its limit with more left. */
  readonly complete: boolean;
  /** Why the read failed, when it did. */
  readonly error?: unknown;
}

export interface ConfigData {
  readonly services: ConfigList<WithId<HealthcareService>>;
  readonly providers: ConfigList<ConfigurableActor<WithId<Practitioner>>>;
  readonly rooms: ConfigList<ConfigurableActor<WithId<Location>>>;
  readonly devices: ConfigList<ConfigurableActor<WithId<Device>>>;
  /** Calendars scheduling cannot book, with several actors or an actor of a type it doesn't schedule. */
  readonly unbookableCalendars: number;
  /** Puts resources the server now holds into the lists, in place of what they were loaded as. */
  readonly store: (resources: readonly WithId<Resource>[]) => void;
}

interface Read<T> {
  readonly items: readonly T[];
  readonly complete: boolean;
}

interface Settled<T> {
  readonly value?: T;
  readonly error?: unknown;
  readonly loading: boolean;
}

const LOADING = { loading: true } as const;

/**
 * Reads everything the configuration workspace lists, one search per section so that each fails on its own,
 * and lays whatever the workspace has saved since over what was read.
 * @returns The sections as read, and a way to store what the workspace saves.
 */
export function useConfigData(): ConfigData {
  const medplum = useMedplum();
  const [services, setServices] = useState<Settled<Read<WithId<HealthcareService>>>>(LOADING);
  const [providers, setProviders] = useState<Settled<Read<ConfigurableActor<WithId<Practitioner>>>>>(LOADING);
  const [typedRooms, setTypedRooms] = useState<Settled<Read<ConfigurableActor<WithId<Location>>>>>(LOADING);
  const [devices, setDevices] = useState<Settled<Read<ConfigurableActor<WithId<Device>>>>>(LOADING);
  const [calendars, setCalendars] =
    useState<Settled<{ readonly locations: Read<ConfigurableActor<WithId<Location>>>; readonly skipped: number }>>(
      LOADING
    );
  // Everything saved here, in the order it was saved. Laid over each read, so a save made while a read was
  // still in flight isn't lost when the older result lands.
  const [saved, setSaved] = useState<readonly WithId<Resource>[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const options: ConfigSearchOptions = { signal: controller.signal };
    function settle<T>(promise: Promise<T>, set: (settled: Settled<T>) => void): void {
      promise
        .then((value) => !controller.signal.aborted && set({ value, loading: false }))
        .catch((error: unknown) => !controller.signal.aborted && set({ error, loading: false }));
    }
    settle(
      searchConfigurableServices(medplum, options).then((result) => ({
        items: result.services,
        complete: result.complete,
      })),
      setServices
    );
    settle(searchConfigurableActors(medplum, 'Practitioner', options).then(toRead), setProviders);
    settle(searchConfigurableActors(medplum, 'Location', options).then(toRead), setTypedRooms);
    settle(searchConfigurableActors(medplum, 'Device', options).then(toRead), setDevices);
    settle(
      searchConfigurableCalendars(medplum, options).then((result) => ({
        locations: { items: result.locations, complete: result.complete },
        skipped: result.skipped,
      })),
      setCalendars
    );
    return () => controller.abort();
  }, [medplum]);

  const store = useCallback((resources: readonly WithId<Resource>[]): void => {
    setSaved((current) => [...current, ...resources]);
  }, []);

  return useMemo((): ConfigData => {
    const servicesList = toList(services, (items) =>
      saved.reduce(
        (list, resource) => (resource.resourceType === 'HealthcareService' ? withStoredService(list, resource) : list),
        items
      )
    );
    const withSaved = <T extends ConfigurableActor>(items: readonly T[]): T[] =>
      saved.reduce((list, resource) => withStoredActorResource(list, resource), [...items]);

    // Rooms come from two reads: the Locations typed as rooms, and the Locations some calendar is held on alone.
    const rooms: ConfigList<ConfigurableActor<WithId<Location>>> = {
      items: withSaved(mergeActors(typedRooms.value?.items ?? [], calendars.value?.locations.items ?? [])),
      loading: typedRooms.loading || calendars.loading,
      complete: (typedRooms.value?.complete ?? true) && (calendars.value?.locations.complete ?? true),
      error: typedRooms.error ?? calendars.error,
    };

    return {
      services: servicesList,
      providers: toList(providers, withSaved),
      rooms,
      devices: toList(devices, withSaved),
      unbookableCalendars: calendars.value?.skipped ?? 0,
      store,
    };
  }, [services, providers, typedRooms, devices, calendars, saved, store]);
}

function toRead<T>(result: { readonly actors: T[]; readonly complete: boolean }): Read<T> {
  return { items: result.actors, complete: result.complete };
}

function toList<T>(settled: Settled<Read<T>>, apply: (items: readonly T[]) => readonly T[]): ConfigList<T> {
  return {
    items: apply(settled.value?.items ?? []),
    loading: settled.loading,
    complete: settled.value?.complete ?? true,
    error: settled.error,
  };
}
