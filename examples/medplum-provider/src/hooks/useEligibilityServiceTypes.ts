// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { isOk } from '@medplum/core';
import type { OperationOutcome, ValueSet } from '@medplum/fhirtypes';
import { useSearchOne } from '@medplum/react';
import { useMemo } from 'react';
import type { ServiceType } from '../utils/eligibility';
import { ELIGIBILITY_SERVICE_TYPES_VALUESET_URL, getEligibilityServiceTypes } from '../utils/eligibility';

/**
 * The practice's eligibility service types: the ValueSet they are saved in, if any, and the service types to ask about.
 * `loading` is true until the ValueSet lookup has answered, and stays true while disabled. `error` is the outcome of
 * a lookup that failed, in which case `valueSet` is unknown rather than missing and `serviceTypes` is the default.
 */
export interface EligibilityServiceTypes {
  readonly valueSet: WithId<ValueSet> | undefined;
  readonly serviceTypes: ServiceType[];
  readonly loading: boolean;
  readonly error: OperationOutcome | undefined;
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
  const error = outcome && !isOk(outcome) ? outcome : undefined;
  return { valueSet, serviceTypes, loading: searching || outcome === undefined, error };
}
