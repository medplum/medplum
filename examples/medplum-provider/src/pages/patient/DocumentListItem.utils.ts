// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication, DocumentReference } from '@medplum/fhirtypes';
import type { DocumentSource } from './documentDisplay';
import { getDocumentName, getDocumentSource, getDocumentTypeDisplay } from './documentDisplay';

export type PatientDocument = {
  id: string;
  resourceType: 'DocumentReference' | 'Communication';
  resource: DocumentReference | Communication;
  name: string;
  date: string | undefined;
  contentType: string | undefined;
  documentType: string | undefined;
  source: DocumentSource;
};

/**
 * Normalizes a DocumentReference into the flat shape the list item renders.
 * @param doc - The DocumentReference to normalize.
 * @returns The normalized PatientDocument.
 */
export function toPatientDocument(doc: DocumentReference): PatientDocument {
  return {
    id: doc.id ?? '',
    resourceType: 'DocumentReference',
    resource: doc,
    name: getDocumentName(doc),
    date: doc.date || doc.meta?.lastUpdated,
    contentType: doc.content?.[0]?.attachment?.contentType,
    documentType: getDocumentTypeDisplay(doc),
    source: getDocumentSource(doc),
  };
}
