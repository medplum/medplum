// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtension, getExtensionValue, isReference, ServiceTypeReferenceURI } from '@medplum/core';
import type { Appointment, CodeableConcept } from '@medplum/fhirtypes';

export interface ServiceTypes {
  readonly visitType?: CodeableConcept;
  readonly procedures: CodeableConcept[];
}

/**
 * Reads the first entry carrying a HealthcareService reference as the visit type: the entry
 * `extractServiceTypeReferences` reads first, so the service named is the one acted on.
 * Additional referenced entries are ignored. Entries without a reference are procedures.
 *
 * @param appointment - The appointment being described.
 * @returns The visit type, if present, and the procedure codes.
 */
export function partitionServiceTypes(appointment: Appointment): ServiceTypes {
  const serviceType = appointment.serviceType ?? [];
  return {
    visitType: serviceType.find((concept) =>
      isReference(getExtensionValue(concept, ServiceTypeReferenceURI), 'HealthcareService')
    ),
    procedures: serviceType.filter((concept) => !getExtension(concept, ServiceTypeReferenceURI)),
  };
}
