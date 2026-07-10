// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClientEventMap, ResourceModifiedEvent } from '@medplum/core';
import type { ExtractResource, ResourceType } from '@medplum/fhirtypes';
import { useEffect, useRef } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

/**
 * React hook for observing FHIR resource modifications made through the Medplum client.
 *
 * The callback is invoked whenever this client instance creates, updates, patches, or deletes
 * a resource of one of the given types, including modifications announced with
 * `MedplumClient.notifyResourceModified`. Use it to keep local component state in sync with
 * mutations made elsewhere in the application. Subscribing to a single resource type narrows
 * the event so `event.resource` is typed to that resource, no type guard required:
 *
 * ```tsx
 * useResourceModified('Slot', (event) => {
 *   // event.resource is `WithId<Slot> | undefined`
 * });
 * useResourceModified(['Slot', 'Appointment'], () => refreshSchedule());
 * ```
 *
 * Modifications made by other clients (or other users) are not observed;
 * use `useSubscription` for server-side change notifications.
 *
 * @param resourceType - The resource type or types to observe.
 * @param callback - Invoked with the event payload for each matching modification.
 */
export function useResourceModified<K extends ResourceType>(
  resourceType: K | K[],
  callback: (event: ResourceModifiedEvent<ExtractResource<K>>) => void
): void {
  const medplum = useMedplum();
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  const typesKey = Array.isArray(resourceType) ? resourceType.join(',') : resourceType;

  useEffect(() => {
    const types = new Set(typesKey.split(','));
    const listener = (event: MedplumClientEventMap['resourceModified']): void => {
      if (types.has(event.payload.resourceType)) {
        // Guarded above: the payload's resourceType is one of `K`, so this narrowing holds.
        callbackRef.current(event.payload as ResourceModifiedEvent<ExtractResource<K>>);
      }
    };
    medplum.addEventListener('resourceModified', listener);
    return () => medplum.removeEventListener('resourceModified', listener);
  }, [medplum, typesKey]);
}
