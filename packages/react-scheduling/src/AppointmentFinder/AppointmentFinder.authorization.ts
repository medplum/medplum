// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { valueSetElementToCoding } from '@medplum/react';

/** The value set the procedure code field binds to when a host names none. */
export const DEFAULT_PROCEDURE_VALUE_SET = 'http://www.ama-assn.org/go/cpt/vs';

/** The value set the diagnosis code field binds to when a host names none. */
export const DEFAULT_DIAGNOSIS_VALUE_SET = 'http://hl7.org/fhir/sid/icd-10-cm/vs';

/**
 * The authorization-related values that the booking form captures for a visit type
 * that requires authorization.
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
 * Whether all the required authorization values have been filled in.
 * @param values - Values captured from the authorization fields.
 * @returns True once both code fields hold at least one code and medical necessity is confirmed.
 */
export function hasRequiredAuthorizationValues(values: BookingAuthorizationValues): boolean {
  return values.procedure.length > 0 && values.diagnosis.length > 0 && values.medicalNecessity;
}

/**
 * Reads the codes a field is holding into a list of codings.
 * @param elements - What the field is holding.
 * @returns The codings to record, dropping anything that never became a code.
 */
export function toCodings(elements: readonly ValueSetExpansionContains[]): Coding[] {
  return elements.map((element) => valueSetElementToCoding(element)).filter((coding) => !!coding.code);
}
