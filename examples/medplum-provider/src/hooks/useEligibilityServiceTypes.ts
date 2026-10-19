// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { ValueSet } from '@medplum/fhirtypes';
import { useSearchOne } from '@medplum/react';
import { useMemo } from 'react';
import type { ServiceType } from '../utils/eligibility';
import { ELIGIBILITY_SERVICE_TYPES_VALUESET_URL, getEligibilityServiceTypes } from '../utils/eligibility';

/** The practice's eligibility service types: the ValueSet they are saved in, if any, and the service types to ask about. */
export interface EligibilityServiceTypes {
  readonly valueSet: WithId<ValueSet> | undefined;
  readonly serviceTypes: ServiceType[];
  /** True until the ValueSet lookup has answered; while disabled it stays true. */
  readonly loading: boolean;
}

/**
 * Loads the service types the practice asks about in eligibility checks, from the project-wide ValueSet at
 * `ELIGIBILITY_SERVICE_TYPES_VALUESET_URL`. Without one they are the default, Health Benefit Plan Coverage alone.
 * @param enabled - Whether to load; false leaves `loading` set and the service types at the default.
 * @returns The eligibility service types.
 */
export function useEligibilityServiceTypes(enabled = true): EligibilityServiceTypes {
  const [valueSet, searching, outcome] = useSearchOne(
    'ValueSet',
    { url: ELIGIBILITY_SERVICE_TYPES_VALUESET_URL },
    { enabled }
  );
  const serviceTypes = useMemo(() => getEligibilityServiceTypes(valueSet), [valueSet]);
  return { valueSet, serviceTypes, loading: searching || outcome === undefined };
}
