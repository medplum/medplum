// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DocumentReference, ServiceRequest } from '@medplum/fhirtypes';
import type { MedplumClient } from '@medplum/core';

/**
 * Fetches DocumentReference resources with LabOrderRequisition category that match a ServiceRequest's Health Gorilla Requisition ID
 */
export async function fetchLabOrderRequisitionDocuments(
  medplum: MedplumClient,
  serviceRequest: ServiceRequest
): Promise<DocumentReference[]> {
  // Extract Health Gorilla Requisition ID from ServiceRequest
  const healthGorillaRequisitionId = getHealthGorillaRequisitionId(serviceRequest);
  
  if (!healthGorillaRequisitionId) {
    return [];
  }

  try {
    const searchParams = new URLSearchParams({
      category: 'LabOrderRequisition',
      identifier: `https://www.healthgorilla.com|${healthGorillaRequisitionId}`,
      _sort: '-_lastUpdated',
    });

    const results = await medplum.searchResources('DocumentReference', searchParams, { cache: 'no-cache' });
    return results;
  } catch (error) {
    console.error('Error fetching Lab Order Requisition documents:', error);
    return [];
  }
}

/**
 * Extracts the Health Gorilla Requisition ID from a ServiceRequest
 * Looks for the requisition identifier with system "https://www.healthgorilla.com"
 */
function getHealthGorillaRequisitionId(serviceRequest: ServiceRequest): string | undefined {
  // Check if ServiceRequest has a requisition identifier
  if (serviceRequest.requisition?.system === 'https://www.healthgorilla.com') {
    return serviceRequest.requisition.value;
  }

  // Also check the identifier array for Health Gorilla identifiers
  if (serviceRequest.identifier) {
    const healthGorillaIdentifier = serviceRequest.identifier.find(
      (id) => id.system === 'https://www.healthgorilla.com'
    );
    if (healthGorillaIdentifier?.value) {
      return healthGorillaIdentifier.value;
    }
  }

  return undefined;
}
