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
 * What the booking form captures for a visit type's requirements: one value per requirement it
 * can be asked for.
 */
export interface BookingRequirementValues {
  readonly procedure: readonly Coding[];
  readonly diagnosis: readonly Coding[];
  readonly medicalNecessity: boolean;
}

export const EMPTY_REQUIREMENT_VALUES: BookingRequirementValues = {
  procedure: [],
  diagnosis: [],
  medicalNecessity: false,
};

/** What answers each requirement. */
const REQUIREMENT_ANSWERS: Record<SchedulingRequirement, (values: BookingRequirementValues) => boolean> = {
  [REQUIRES_PROCEDURE_CODE]: (values) => values.procedure.length > 0,
  [REQUIRES_DIAGNOSIS_CODE]: (values) => values.diagnosis.length > 0,
  [REQUIRES_MEDICAL_NECESSITY_CODE]: (values) => values.medicalNecessity,
};

/**
 * Whether one requirement has been answered.
 * @param requirement - The requirement to weigh.
 * @param values - What the fields are holding.
 * @returns True when the field answering that requirement holds a value.
 */
export function isRequirementAnswered(requirement: SchedulingRequirement, values: BookingRequirementValues): boolean {
  return REQUIREMENT_ANSWERS[requirement](values);
}

/**
 * Whether every requirement a visit type names has been answered.
 * @param values - What the fields are holding.
 * @param requirements - What the visit type requires, from its eligibility codes.
 * @returns True once each required field holds a value. A value nothing asked for is not weighed.
 */
export function hasRequiredValues(
  values: BookingRequirementValues,
  requirements: ReadonlySet<SchedulingRequirement>
): boolean {
  return [...requirements].every((requirement) => isRequirementAnswered(requirement, values));
}

/**
 * Reads the codes a field is holding into a list of codings.
 * @param elements - What the field is holding.
 * @returns The codings to record, dropping anything that never became a code.
 */
export function toCodings(elements: readonly ValueSetExpansionContains[]): Coding[] {
  return elements.map((element) => valueSetElementToCoding(element)).filter((coding) => !!coding.code);
}
