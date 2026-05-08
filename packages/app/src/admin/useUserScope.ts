// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';

export type UserScope = 'loading' | 'project' | 'global';

/**
 * Resolve the scope of a User by reading the resource and inspecting `meta.project`.
 *
 * If the read fails (e.g. a project admin requesting a global User they cannot access),
 * the scope is treated as `'global'` — global Users are not readable by project admins.
 *
 * Returns the current scope and a `refresh` function that re-fetches the User after
 * invalidating the client cache, so callers can update the page after a rescope op.
 * @param userId - The id of the User to resolve, or `undefined` to remain in `'loading'`.
 * @param projectId - The id of the Project to compare against `User.meta.project`.
 * @returns A tuple of `[scope, refresh]` where `refresh` re-fetches the User after invalidating cache.
 */
export function useUserScope(
  userId: string | undefined,
  projectId: string | undefined
): [UserScope, () => void] {
  const medplum = useMedplum();
  const [scope, setScope] = useState<UserScope>('loading');
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }
    let cancelled = false;
    setScope('loading');
    medplum
      .readResource('User', userId)
      .then((user) => {
        if (cancelled) {
          return;
        }
        setScope(user.meta?.project && user.meta.project === projectId ? 'project' : 'global');
      })
      .catch(() => {
        if (!cancelled) {
          setScope('global');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [medplum, userId, projectId, refreshCount]);

  const refresh = useCallback(() => {
    medplum.invalidateSearches('User');
    setRefreshCount((c) => c + 1);
  }, [medplum]);

  return [scope, refresh];
}
