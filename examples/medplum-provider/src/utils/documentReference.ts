// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DocumentReference, ServiceRequest } from '@medplum/fhirtypes';
import type { MedplumClient } from '@medplum/core';

const HEALTH_GORILLA_REQUEST_SYSTEM = 'https://www.healthgorilla.com';

/**
 * Fetches DocumentReference resources with LabOrderRequisition category that match a ServiceRequest's Health Gorilla Requisition ID
 * @param medplum - The Medplum client
 * @param serviceRequest - The ServiceRequest to fetch the DocumentReference for
 * @returns The DocumentReference resources
 */
export async function fetchLabOrderRequisitionDocuments(
  medplum: MedplumClient,
  serviceRequest: ServiceRequest
): Promise<DocumentReference[]> {
  const healthGorillaRequisitionId = getHealthGorillaRequisitionId(serviceRequest);

  if (!healthGorillaRequisitionId) {
    return [];
  }

  const searchParams = new URLSearchParams({
    category: 'LabOrderRequisition',
    identifier: `${HEALTH_GORILLA_REQUEST_SYSTEM}|${healthGorillaRequisitionId}`,
    _sort: '-_lastUpdated',
  });

  const results = await medplum.searchResources('DocumentReference', searchParams, { cache: 'no-cache' });
  return results;
}

/**
 * Extracts the Health Gorilla Requisition ID from a ServiceRequest
 * Looks for the requisition identifier with system "https://www.healthgorilla.com"
 * @param serviceRequest - The ServiceRequest to extract the Health Gorilla Requisition ID from
 * @returns The Health Gorilla Requisition ID
 */
export function getHealthGorillaRequisitionId(serviceRequest: ServiceRequest): string | undefined {
  // Check if ServiceRequest has a requisition identifier
  if (serviceRequest.requisition?.system === HEALTH_GORILLA_REQUEST_SYSTEM) {
    return serviceRequest.requisition.value;
  }

  // Also check the identifier array for Health Gorilla identifiers
  if (serviceRequest.identifier) {
    const healthGorillaIdentifier = serviceRequest.identifier.find((id) => id.system === HEALTH_GORILLA_REQUEST_SYSTEM);
    if (healthGorillaIdentifier?.value) {
      return healthGorillaIdentifier.value;
    }
  }

  return undefined;
}
