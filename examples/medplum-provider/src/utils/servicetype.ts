// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Mirrors packages/server/src/util/servicetype.ts. That utility lives in the
// server package which can't be imported here, but since it only depends on
// @medplum/core and @medplum/fhirtypes we maintain a copy for client-side use.

import type { WithId } from '@medplum/core';
import { createReference, getExtensionValue, getReferenceString, isDefined } from '@medplum/core';
import type { CodeableConcept, HealthcareService, Reference } from '@medplum/fhirtypes';

export const ServiceTypeReferenceURI = 'https://medplum.com/fhir/service-type-reference';

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

export function toCodeableReferenceLike(service: WithId<HealthcareService>): CodeableConcept[] {
  const extension = [{ url: ServiceTypeReferenceURI, valueReference: createReference(service) }];
  if (!service.type?.length) {
    return [{ extension }];
  }
  return service.type.map((concept) => ({ ...concept, extension: [...(concept.extension ?? []), ...extension] }));
}

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
