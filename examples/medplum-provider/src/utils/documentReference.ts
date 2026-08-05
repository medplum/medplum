// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Attachment, DocumentReference, ServiceRequest } from '@medplum/fhirtypes';

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
 * Resolves DiagnosticReport.presentedForm attachments into displayable attachments.
 * Some integrations (e.g. HGDX) set Attachment.url to a DocumentReference reference
 * such as "DocumentReference/123" instead of a binary URL. For those entries, fetch
 * the DocumentReference and use its content attachment instead, preferring the
 * content whose contentType matches the presentedForm entry.
 * @param medplum - The Medplum client
 * @param presentedForm - The DiagnosticReport.presentedForm attachments
 * @returns The displayable attachments
 */
export async function resolvePresentedFormAttachments(
  medplum: MedplumClient,
  presentedForm: Attachment[] | undefined
): Promise<Attachment[]> {
  const resolved = await Promise.all(
    (presentedForm ?? []).map(async (form) => {
      const docRefId = form.url?.startsWith('DocumentReference/') ? form.url.split('/')[1] : undefined;
      if (!docRefId) {
        return form;
      }
      try {
        const docRef = await medplum.readResource('DocumentReference', docRefId);
        const content =
          docRef.content?.find((c) => c.attachment?.contentType === form.contentType) ?? docRef.content?.[0];
        if (!content?.attachment) {
          return undefined;
        }
        return { ...content.attachment, title: form.title ?? content.attachment.title };
      } catch (error) {
        console.error('Error resolving presented form document reference:', error);
        return undefined;
      }
    })
  );
  return resolved.filter((attachment): attachment is Attachment => !!attachment);
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
