// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import { useCallback, useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';
import { useSubscription } from '../useSubscription/useSubscription';

export interface UseNotificationCountOptions {
  readonly resourceType: ResourceType;
  readonly countCriteria: string;
  readonly subscriptionCriteria: string;
}

/**
 * Returns a live notification count for a given resource type.
 *
 * Uses `medplum.search()` for the initial count (with default cache policy) and
 * subscribes to real-time updates via `useSubscription()`, re-fetching with
 * `cache: 'reload'` whenever a matching event arrives.
 *
 * @param options - The resource type, count search criteria, and subscription criteria.
 * @returns The current notification count.
 */
export function useNotificationCount(options: UseNotificationCountOptions): number {
  const medplum = useMedplum();
  const { resourceType, countCriteria, subscriptionCriteria } = options;
  const [count, setCount] = useState(0);

  const updateCount = useCallback(
    (cache: 'default' | 'reload') => {
      medplum
        .search(resourceType, countCriteria, { cache })
        .then((result) => setCount(result.total as number))
        .catch(console.error);
    },
    [medplum, resourceType, countCriteria]
  );

  // Initial count
  useEffect(() => {
    updateCount('default');
  }, [updateCount]);

  // Subscribe to the criteria
  useSubscription(subscriptionCriteria, () => {
    updateCount('reload');
  });

  return count;
}
