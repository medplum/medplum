// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { Resource, ResourceType, Schedule } from '@medplum/fhirtypes';
import { useSearchResources } from '@medplum/react-hooks';
import { useMemo } from 'react';

function getScheduleActorRef(schedule: Schedule): string | undefined {
  const ref = schedule.actor[0];
  return ref ? getReferenceString(ref) : undefined;
}

/**
 * Resolves human-readable display labels for the actors referenced by a set
 * of Schedules, one search per actor resourceType present. Used to label
 * criteria-panel Room/Provider/Device selects.
 * @param pools - Resource pools, one array of Schedules per actor resourceType.
 * @returns A map from actor reference string (e.g. "Practitioner/abc") to display label.
 */
export function useActorLabels(pools: Partial<Record<ResourceType, Schedule[]>>): Map<string, string> {
  const practitionerIds = (pools.Practitioner ?? []).map(getScheduleActorRef).filter(Boolean) as string[];
  const locationIds = (pools.Location ?? []).map(getScheduleActorRef).filter(Boolean) as string[];
  const deviceIds = (pools.Device ?? []).map(getScheduleActorRef).filter(Boolean) as string[];

  const [practitioners] = useSearchResources(
    'Practitioner',
    practitionerIds.length ? [['_id', practitionerIds.map((r) => r.split('/')[1]).join(',')]] : undefined,
    { enabled: practitionerIds.length > 0 }
  );
  const [locations] = useSearchResources(
    'Location',
    locationIds.length ? [['_id', locationIds.map((r) => r.split('/')[1]).join(',')]] : undefined,
    { enabled: locationIds.length > 0 }
  );
  const [devices] = useSearchResources(
    'Device',
    deviceIds.length ? [['_id', deviceIds.map((r) => r.split('/')[1]).join(',')]] : undefined,
    { enabled: deviceIds.length > 0 }
  );

  return useMemo(() => {
    const map = new Map<string, string>();
    const all: Resource[] = [...(practitioners ?? []), ...(locations ?? []), ...(devices ?? [])];
    for (const resource of all) {
      const ref = getReferenceString(resource);
      if (ref) {
        map.set(ref, getDisplayString(resource));
      }
    }
    return map;
  }, [practitioners, locations, devices]);
}

export { getScheduleActorRef };
