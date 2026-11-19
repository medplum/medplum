// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';

type ServicesByReference = ReadonlyMap<string, WithId<HealthcareService> | undefined>;

const NO_SERVICES: ServicesByReference = new Map();

/**
 * Reads HealthcareServices by reference, keeping the ones read before.
 * @param references - The references to read. Repeats are read once.
 * @returns The services whose reads have settled, by reference: undefined for one that could
 * not be read.
 */
export function useHealthcareServices(references: readonly string[]): ServicesByReference {
  const medplum = useMedplum();
  const [services, setServices] = useState(NO_SERVICES);

  // A string, so the effect below runs only when the references themselves change.
  const referencesKey = useMemo(
    () => [...new Set(references)].sort((a, b) => a.localeCompare(b)).join(','),
    [references]
  );

  useEffect(() => {
    if (!referencesKey) {
      return;
    }
    // No abort signal: these reads are shared, through the client's cache, with the event
    // titles, which would fail along with them. A late result is still worth keeping.
    // Each settles on its own, so one slow read doesn't hold back the other service types.
    const settle = (reference: string, read: WithId<HealthcareService> | undefined): void =>
      setServices((previous) => {
        // A failed read settles the service without forgetting one read before.
        const service = read ?? previous.get(reference);
        return previous.has(reference) && previous.get(reference) === service
          ? previous
          : new Map(previous).set(reference, service);
      });
    for (const reference of referencesKey.split(',')) {
      medplum
        .readReference<HealthcareService>({ reference })
        .then((service) => settle(reference, service))
        .catch(() => settle(reference, undefined));
    }
  }, [medplum, referencesKey]);

  return services;
}
