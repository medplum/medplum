// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { checkValueSetAvailability, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { DependencyGroup, DependencyProbe } from '../config/appDependencies';
import { DEPENDENCY_GROUPS } from '../config/appDependencies';

type ProbeResult = 'present' | 'missing' | 'unknown';

export interface UseMissingDependenciesResult {
  /** Dependency groups detected as missing (unlinked). */
  readonly missingGroups: DependencyGroup[];
  /** True while the probes are in flight. */
  readonly loading: boolean;
}

/**
 * Probes the app's expected shared-project dependencies once after sign-in and reports which are
 * missing. ValueSet probes go through `@medplum/react`'s shared availability cache, so a given
 * ValueSet is expanded at most once per client and the result is shared with the inline
 * field-level checks (a missing ValueSet recovers automatically once the project is linked).
 *
 * Definitive negatives count as "missing": a 400/404 `$expand`, or an empty profile search.
 * Transient failures (network errors, 401/403/5xx) throw and are treated as "unknown", never
 * flagging a dependency, so a flaky connection or an outright-denied request does not false-alarm.
 *
 * Caveat: a profile search that returns *empty* is treated as missing. An AccessPolicy that
 * merely filters that resource type out (returning an empty 200, rather than denying access,
 * which throws) can therefore produce a false positive for a restricted user. The banner is
 * advisory and dismissible, and the users who can act on it (project admins) are not usually
 * restricted this way — but the ValueSet probe is the only one that cannot false-alarm.
 * @returns The missing dependency groups and a loading flag.
 */
export function useMissingDependencies(): UseMissingDependenciesResult {
  const medplum = useMedplum();
  // Callers only mount this hook after sign-in; re-key on the active project so the probes re-run
  // if the user switches projects without a full reload.
  const projectId = medplum.getProject()?.id;
  // Tagged with the project id it was computed for, so a result from a previous project isn't
  // shown after the key changes (and `loading` is derived from whether it matches).
  const [result, setResult] = useState<{ projectId?: string; missing: DependencyGroup[] }>();

  useEffect(() => {
    let active = true;
    detectMissingGroups(medplum)
      .then((missing) => {
        if (active) {
          setResult({ projectId, missing });
        }
      })
      // detectMissingGroups doesn't reject in practice (runProbe catches every probe error and
      // returns a verdict); this no-op handler only satisfies the no-floating-promises rule.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [medplum, projectId]);

  const resolved = result?.projectId === projectId ? result : undefined;
  return { missingGroups: resolved?.missing ?? [], loading: !resolved };
}

async function detectMissingGroups(medplum: MedplumClient): Promise<DependencyGroup[]> {
  const results = await Promise.all(
    DEPENDENCY_GROUPS.map(async (group) => ({ group, result: await runProbe(medplum, group.probe) }))
  );
  return results.filter(({ result }) => result === 'missing').map(({ group }) => group);
}

async function runProbe(medplum: MedplumClient, probe: DependencyProbe): Promise<ProbeResult> {
  try {
    switch (probe.kind) {
      case 'valueSet': {
        const availability = await checkValueSetAvailability(medplum, probe.url);
        if (availability.status === 'available') {
          return 'present';
        }
        return availability.status === 'unavailable' ? 'missing' : 'unknown';
      }
      case 'profile': {
        const found = await medplum.searchOne('StructureDefinition', { url: probe.url });
        return found ? 'present' : 'missing';
      }
      default:
        return 'unknown';
    }
  } catch {
    // A thrown error (network, auth, rate limit, 5xx) is inconclusive and never flags a dependency.
    return 'unknown';
  }
}
