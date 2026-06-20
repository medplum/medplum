// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication, DocumentReference } from '@medplum/fhirtypes';

export type DocumentSource = 'Fax' | 'Lab' | 'Upload' | 'Message';

export const DOCUMENT_SOURCES: DocumentSource[] = ['Fax', 'Lab', 'Upload', 'Message'];

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

const FAX_MEDIUM_CODE = 'FAXWRIT';

/**
 * Returns true when the Communication was sent or received as a fax.
 * @param comm - The Communication to inspect.
 * @returns True when any medium coding is the fax code.
 */
export function isFaxMedium(comm: Communication): boolean {
  return comm.medium?.some((m) => m.coding?.some((c) => c.code === FAX_MEDIUM_CODE)) ?? false;
}

/**
 * Returns the human-readable type of a DocumentReference (its FHIR `type` display),
 * or undefined when no type is set.
 * @param doc - The DocumentReference to read the type from.
 * @returns The type display or text, or undefined when no type is set.
 */
export function getDocumentTypeDisplay(doc: DocumentReference): string | undefined {
  return doc.type?.coding?.[0]?.display || doc.type?.text;
}

export function toPatientDocument(
  resource: DocumentReference | Communication,
  options?: { asMessageAttachment?: boolean }
): PatientDocument {
  if (resource.resourceType === 'DocumentReference') {
    return docRefToPatientDoc(resource, options?.asMessageAttachment ?? false);
  }
  return commToPatientDoc(resource);
}

function docRefToPatientDoc(doc: DocumentReference, asMessageAttachment: boolean): PatientDocument {
  const documentType = getDocumentTypeDisplay(doc);
  const isLab = (documentType ?? '').toLowerCase().includes('lab');
  let source: DocumentSource;
  if (asMessageAttachment) {
    source = 'Message';
  } else if (isLab) {
    source = 'Lab';
  } else {
    source = 'Upload';
  }
  return {
    id: doc.id ?? '',
    resourceType: 'DocumentReference',
    resource: doc,
    name: doc.description || doc.content?.[0]?.attachment?.title || 'Untitled Document',
    date: doc.date || doc.meta?.lastUpdated,
    contentType: doc.content?.[0]?.attachment?.contentType,
    documentType,
    source,
  };
}

function commToPatientDoc(comm: Communication): PatientDocument {
  const attachment = comm.payload?.find((p) => p.contentAttachment)?.contentAttachment;
  const isFax = isFaxMedium(comm);

  let name: string;
  if (isFax) {
    const originatingFaxNumber = comm.extension?.find(
      (ext) => ext.url === 'https://efax.com/originating-fax-number'
    )?.valueString;
    name = attachment?.title || (originatingFaxNumber ? `Fax from ${originatingFaxNumber}` : 'Received Fax');
  } else {
    name = attachment?.title || 'Message Attachment';
  }

  return {
    id: comm.id ?? '',
    resourceType: 'Communication',
    resource: comm,
    name,
    date: comm.sent || comm.meta?.lastUpdated,
    contentType: attachment?.contentType,
    documentType: undefined,
    source: isFax ? 'Fax' : 'Message',
  };
}
