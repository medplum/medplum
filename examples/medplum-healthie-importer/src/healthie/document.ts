// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { DocumentReference, Patient, Reference } from '@medplum/fhirtypes';
import type { HealthieClient } from './client';
import { HEALTHIE_DOCUMENT_ID_SYSTEM } from './constants';
import { convertHealthieTimestampToIso } from './questionnaire-response';

export interface HealthieDocument {
  id: string;
  display_name?: string;
  description?: string;
  file_content_type?: string;
  extension?: string;
  expiring_url?: string;
  rel_user_id?: string;
  owner?: { id: string; name?: string };
  include_in_charting?: boolean;
  internal_notes?: string;
  created_at: string;
  updated_at?: string;
}

export async function fetchDocuments(healthie: HealthieClient, patientId: string): Promise<HealthieDocument[]> {
  const allDocuments: HealthieDocument[] = [];
  let hasMorePages = true;
  let offset = 0;
  const pageSize = 100;
  let loopCount = 0;

  while (hasMorePages) {
    const query = `
      query fetchDocuments($patientId: String, $offset: Int) {
        documents(viewable_user_id: $patientId, offset: $offset) {
          id
          display_name
          description
          file_content_type
          extension
          expiring_url
          rel_user_id
          owner {
            id
            name
          }
          include_in_charting
          internal_notes
          created_at
          updated_at
        }
      }
    `;

    const result = await healthie.query<{ documents: HealthieDocument[] | null }>(query, {
      patientId,
      offset,
    });

    const documents = result.documents ?? [];
    allDocuments.push(...documents);

    hasMorePages = documents.length === pageSize;
    offset += pageSize;

    loopCount++;
    if (loopCount > 1000) {
      throw new Error('Exiting fetchDocuments due to too many pages');
    }
  }

  return allDocuments;
}

export async function downloadDocumentContent(
  expiringUrl: string
): Promise<{ data: Uint8Array; contentType: string } | undefined> {
  try {
    const response = await fetch(expiringUrl);
    if (!response.ok) {
      console.log(`Failed to download document: HTTP ${response.status}`);
      return undefined;
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
      console.log(`Warning: Document is large (${contentLength} bytes)`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return { data, contentType };
  } catch (error) {
    console.log('Failed to download document content:', error);
    return undefined;
  }
}

export async function shouldDownloadDocument(doc: HealthieDocument, medplum: MedplumClient): Promise<boolean> {
  try {
    const existing = await medplum.searchResources('DocumentReference', {
      identifier: `${HEALTHIE_DOCUMENT_ID_SYSTEM}|${doc.id}`,
    });

    if (existing.length === 0) {
      return true;
    }

    const lastUpdated = existing[0].meta?.lastUpdated;
    if (!lastUpdated || !doc.updated_at) {
      return true;
    }

    const healthieDate = new Date(doc.updated_at);
    const medplumDate = new Date(lastUpdated);
    return healthieDate > medplumDate;
  } catch (error) {
    console.log('Error checking existing document, will re-download:', error);
    return true;
  }
}

export function convertHealthieDocumentToFhir(
  doc: HealthieDocument,
  patientReference: Reference<Patient>
): DocumentReference {
  const contentType = doc.file_content_type || 'application/octet-stream';
  const title = doc.display_name || `document-${doc.id}`;

  return {
    resourceType: 'DocumentReference',
    identifier: [{ system: HEALTHIE_DOCUMENT_ID_SYSTEM, value: doc.id }],
    status: 'current',
    subject: patientReference,
    date: convertHealthieTimestampToIso(doc.created_at),
    description: doc.description || doc.internal_notes || undefined,
    content: [
      {
        attachment: {
          contentType,
          title,
        },
      },
    ],
  };
}
