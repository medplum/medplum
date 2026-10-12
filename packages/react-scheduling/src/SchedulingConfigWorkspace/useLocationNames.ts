// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Location, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import { resolveLocationNames } from './serviceFacilities';

const NOTHING_NAMED: ReadonlyMap<string, string> = new Map();

/**
 * Names Locations by the resources themselves.
 * @param locations - The Locations to name.
 * @returns Each readable Location's name, keyed by its reference, or undefined while they are still being read.
 */
export function useLocationNames(locations: readonly Reference<Location>[]): ReadonlyMap<string, string> | undefined {
  const medplum = useMedplum();
  const [resolved, setResolved] = useState<{ key: string; names: Map<string, string> }>();
  const key = JSON.stringify([...new Set(locations.map((location) => location.reference))].sort());
  const [tracked, setTracked] = useState({ key, locations });
  if (tracked.key !== key) {
    setTracked({ key, locations });
  }

  useEffect(() => {
    if (tracked.locations.length === 0) {
      return undefined;
    }
    const controller = new AbortController();
    resolveLocationNames(medplum, tracked.locations, controller.signal)
      .then((names) => !controller.signal.aborted && setResolved({ key: tracked.key, names }))
      .catch(console.error);
    return () => controller.abort();
  }, [medplum, tracked]);

  if (locations.length === 0) {
    return NOTHING_NAMED;
  }
  return resolved?.key === key ? resolved.names : undefined;
}
