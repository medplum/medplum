// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SchedulingRequirement } from '@medplum/core';
import { REQUIRES_DIAGNOSIS_CODE, REQUIRES_MEDICAL_NECESSITY_CODE, REQUIRES_PROCEDURE_CODE } from '@medplum/core';
import type { Coding, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { valueSetElementToCoding } from '@medplum/react';

/** The value set the procedure code field binds to when a host names none. */
export const DEFAULT_PROCEDURE_VALUE_SET = 'http://www.ama-assn.org/go/cpt/vs';

/** The value set the diagnosis code field binds to when a host names none. */
export const DEFAULT_DIAGNOSIS_VALUE_SET = 'http://hl7.org/fhir/sid/icd-10-cm/vs';

/**
 * The authorization-related values that the booking form captures, each asked for only by a
 * visit type whose eligibility names it.
 */
export interface BookingAuthorizationValues {
  readonly procedure: readonly Coding[];
  readonly diagnosis: readonly Coding[];
  readonly medicalNecessity: boolean;
}

export const EMPTY_AUTHORIZATION_VALUES: BookingAuthorizationValues = {
  procedure: [],
  diagnosis: [],
  medicalNecessity: false,
};

/**
 * Whether every value the visit type asks for has been filled in.
 * @param values - Values captured from the authorization fields.
 * @param requirements - What the visit type requires, from its eligibility codes.
 * @returns True once each required field holds a value. A value nothing asked for is not weighed.
 */
export function hasRequiredAuthorizationValues(
  values: BookingAuthorizationValues,
  requirements: ReadonlySet<SchedulingRequirement>
): boolean {
  return (
    (!requirements.has(REQUIRES_PROCEDURE_CODE) || values.procedure.length > 0) &&
    (!requirements.has(REQUIRES_DIAGNOSIS_CODE) || values.diagnosis.length > 0) &&
    (!requirements.has(REQUIRES_MEDICAL_NECESSITY_CODE) || values.medicalNecessity)
  );
}

/**
 * Reads the codes a field is holding into a list of codings.
 * @param elements - What the field is holding.
 * @returns The codings to record, dropping anything that never became a code.
 */
export function toCodings(elements: readonly ValueSetExpansionContains[]): Coding[] {
  return elements.map((element) => valueSetElementToCoding(element)).filter((coding) => !!coding.code);
}
