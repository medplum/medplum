// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { Location, PractitionerRole } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useState } from 'react';
import type { ConfigurableActorResource } from '../../configSearch';
import { normalizeReference } from '../serviceFacilities';

/** A provider's roles as stored, and the names of the service facilities they name. */
export interface ProviderRoles {
  /** Every role naming the provider, active or not. */
  readonly roles: readonly WithId<PractitionerRole>[];
  /** Keyed by `Location/id`, for each service facility that could be read. */
  readonly names: ReadonlyMap<string, string>;
}

export interface ProviderRolesState {
  /** Absent while the roles are read, or when reading them failed. */
  readonly value?: ProviderRoles;
  readonly error?: unknown;
  /** Lays roles the page has just stored over what was read. */
  readonly store: (saved: readonly WithId<PractitionerRole>[]) => void;
  /** Reads the roles again, past any cached search. */
  readonly reload: () => Promise<void>;
}

/**
 * Reads a provider's PractitionerRoles, inactive ones included, since adding a service facility back reactivates
 * a role before creating one.
 * @param actor - The actor whose page is open.
 * @returns The provider's roles, or undefined for a room or device.
 */
export function useProviderRoles(actor: ConfigurableActorResource): ProviderRolesState | undefined {
  const medplum = useMedplum();
  const practitioner = actor.resourceType === 'Practitioner' ? getReferenceString(actor) : undefined;
  const [read, setRead] = useState<{ value?: ProviderRoles; error?: unknown }>({});

  useEffect(() => {
    if (!practitioner) {
      return undefined;
    }
    const controller = new AbortController();
    readProviderRoles(medplum, practitioner, controller.signal)
      .then((value) => !controller.signal.aborted && setRead({ value }))
      .catch((error: unknown) => !controller.signal.aborted && setRead({ error }));
    return () => controller.abort();
  }, [medplum, practitioner]);

  const store = useCallback((saved: readonly WithId<PractitionerRole>[]): void => {
    setRead((current) => {
      if (!current.value) {
        return current;
      }
      const byId = new Map(saved.map((role) => [role.id, role]));
      const roles = current.value.roles.map((role) => byId.get(role.id) ?? role);
      const added = saved.filter((role) => !current.value?.roles.some((existing) => existing.id === role.id));
      return { value: { ...current.value, roles: [...roles, ...added] } };
    });
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    if (practitioner) {
      setRead({ value: await readProviderRoles(medplum, practitioner, undefined, 'no-cache') });
    }
  }, [medplum, practitioner]);

  if (!practitioner) {
    return undefined;
  }
  return { ...read, store, reload };
}

async function readProviderRoles(
  medplum: MedplumClient,
  practitioner: string,
  signal: AbortSignal | undefined,
  cache?: RequestCache
): Promise<ProviderRoles> {
  const roles = await medplum.searchResources(
    'PractitionerRole',
    { practitioner, _count: '1000' },
    { signal, ...(cache && { cache }) }
  );
  const references = [
    ...new Set(
      roles.flatMap((role) => role.location ?? []).flatMap((location) => normalizeReference(location.reference) ?? [])
    ),
  ];
  // A Location that can't be read is left unnamed, so the page falls back to the display the role carries.
  const names = await Promise.all(
    references.map(async (reference): Promise<[string, string][]> => {
      try {
        return [[reference, getDisplayString(await medplum.readReference<Location>({ reference }, { signal }))]];
      } catch {
        return [];
      }
    })
  );
  return { roles, names: new Map(names.flat()) };
}
