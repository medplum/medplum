// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, EMPTY, getExtensionValue, getReferenceString, isDefined } from '@medplum/core';
import type { CodeableConcept, HealthcareService, Reference } from '@medplum/fhirtypes';

/**
 * In R5/R6, `serviceType` attributes are changing from `CodeableConcept[]` to
 * `CodeableReference<HealthcareService>`.
 *
 * We're choosing to represent this in R4 by adding an extension to CodeableConcept that holds
 * a Reference<HealthcareService>.
 *
 * Example: A Schedule with a serviceType referring to a HealthcareService:
 * ```
 * {
 *   resourceType: 'Schedule',
 *   actor: [{ reference: "Practitioner/abc" }],
 *   serviceType: [
 *     {
 *       extension: [
 *         {
 *           url: "https://medplum.com/fhir/service-type-reference",
 *           valueReference: { reference: "HealthcareService/123" }
 *         }
 *       ]
 *     }
 *  ]
 *
 * This constant holds the extension URI used to hold the reference.
 */
export const ServiceTypeReferenceURI = 'https://medplum.com/fhir/service-type-reference';

/**
 * Convert a HealthcareService into a CodeableReference (as best as we can
 * represent it in R4)
 *
 * @param service - A HealthcareService resource
 * @returns - An array of CodeableConcepts with embedded references to the service
 */
export function toCodeableReferenceLike(service: WithId<HealthcareService>): CodeableConcept[] {
  const extension = [{ url: ServiceTypeReferenceURI, valueReference: createReference(service) }];

  if (!service.type?.length) {
    return [{ extension }];
  }

  return service.type.map((concept) => ({
    ...concept,
    extension: [...(concept.extension ?? EMPTY), ...extension],
  }));
}

/**
 * Check if a service type is a CodeableReferenceLike pointing to a given
 * HealthcareService
 *
 * @param serviceType - An array of CodeableConcepts that can each hold an embedded reference
 * @param service - A HealthcareService resource
 * @returns boolean - true if any concept in the serviceType explicitly refers to the given service
 */
export function isCodeableReferenceLikeTo(
  serviceType: CodeableConcept[] | undefined,
  service: WithId<HealthcareService> | (Reference<HealthcareService> & { reference: string })
): boolean {
  if (!serviceType?.length) {
    return false;
  }
  const refString = getReferenceString(service);
  return serviceType.some((concept) => {
    const ref = getExtensionValue(concept, ServiceTypeReferenceURI) as Reference<HealthcareService> | undefined;
    return ref?.reference === refString;
  });
}

/**
 * Extract References from an array of CodeableReferenceLike objects
 * @param serviceType - An array of CodableConcepts that can each hold an embedded reference
 * @returns An array of HealthcareService references
 */
export function extractReferencesFromCodeableReferenceLike(
  serviceType: CodeableConcept[] | undefined
): Reference<HealthcareService>[] {
  if (!serviceType?.length) {
    return [];
  }

  return serviceType
    .map((concept) => getExtensionValue(concept, ServiceTypeReferenceURI) as Reference<HealthcareService> | undefined)
    .filter(isDefined);
}
