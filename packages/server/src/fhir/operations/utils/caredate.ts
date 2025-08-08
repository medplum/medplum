// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { evalFhirPathTyped, toTypedValue, WithId } from '@medplum/core';
import { Bundle, Resource } from '@medplum/fhirtypes';

/**
 * Care date expressions for each resource type.
 */
const careDateExpressions: Record<string, string> = {
  AllergyIntolerance: 'recordedDate',
  CarePlan: 'created',
  ClinicalImpression: 'date',
  Condition: 'recordedDate',
  DeviceUseStatement: 'recordedOn',
  DiagnosticReport: 'issued',
  Encounter: 'period.start',
  Goal: 'startDate',
  Immunization: 'occurrenceDateTime',
  MedicationRequest: 'authoredOn',
  Observation: 'issued',
  Procedure: 'performedDateTime',
  ServiceRequest: 'occurrenceDateTime',
};

/**
 * Filters the bundle by care date.
 *
 * @param bundle - The bundle to filter.
 * @param start - The date range relates to care dates, not record currency dates - e.g. all records relating to care provided in a certain date range. If no start date is provided, all records prior to the end date are in scope.
 * @param end - The date range relates to care dates, not record currency dates - e.g. all records relating to care provided in a certain date range. If no end date is provided, all records subsequent to the start date are in scope.
 */
export function filterByCareDate(
  bundle: Bundle<WithId<Resource>>,
  start: string | undefined,
  end: string | undefined
): void {
  if (!bundle.entry || (!start && !end)) {
    return;
  }

  const isoStart = normalizeDateTime(start);
  const isoEnd = normalizeDateTime(end);

  bundle.entry = bundle.entry.filter((entry) => {
    const resource = entry.resource as WithId<Resource>;
    const isoDate = getCareDate(resource);
    if (!isoDate) {
      return true;
    }

    return (!isoStart || isoDate >= isoStart) && (!isoEnd || isoDate < isoEnd);
  });
}

/**
 * Returns the care date for the given resource.
 * @param resource - The resource to get the care date for.
 * @returns The care date if available.
 */
export function getCareDate(resource: WithId<Resource>): string | undefined {
  const expr = careDateExpressions[resource.resourceType];
  if (!expr) {
    return undefined;
  }
  return normalizeDateTime(evalFhirPathTyped(expr, [toTypedValue(resource)])?.[0]?.value);
}

/**
 * Normalizes a date time string to an ISO string.
 * @param input - The input string.
 * @returns - The normalized date time string or undefined.
 */
function normalizeDateTime(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }
  try {
    return new Date(input).toISOString();
  } catch (_err) {
    return undefined;
  }
}
