// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication, DocumentReference } from '@medplum/fhirtypes';

export type PatientDocument = {
  id: string;
  resourceType: 'DocumentReference' | 'Communication';
  resource: DocumentReference | Communication;
  name: string;
  date: string | undefined;
  contentType: string | undefined;
  tag: string;
  tagColor: string;
};

export function toPatientDocument(resource: DocumentReference | Communication): PatientDocument {
  if (resource.resourceType === 'DocumentReference') {
    return docRefToPatientDoc(resource);
  }
  return commToPatientDoc(resource);
}

function docRefToPatientDoc(doc: DocumentReference): PatientDocument {
  const tag = getDocRefTag(doc);
  return {
    id: doc.id ?? '',
    resourceType: 'DocumentReference',
    resource: doc,
    name: doc.description || doc.content?.[0]?.attachment?.title || 'Untitled Document',
    date: doc.date || doc.meta?.lastUpdated,
    contentType: doc.content?.[0]?.attachment?.contentType,
    tag: tag.label,
    tagColor: tag.color,
  };
}

function commToPatientDoc(comm: Communication): PatientDocument {
  const attachment = comm.payload?.find((p) => p.contentAttachment)?.contentAttachment;
  const originatingFaxNumber = comm.extension?.find(
    (ext) => ext.url === 'https://efax.com/originating-fax-number'
  )?.valueString;

  const name = attachment?.title || (originatingFaxNumber ? `Fax from ${originatingFaxNumber}` : 'Received Fax');

  return {
    id: comm.id ?? '',
    resourceType: 'Communication',
    resource: comm,
    name,
    date: comm.sent || comm.meta?.lastUpdated,
    contentType: attachment?.contentType,
    tag: 'Fax',
    tagColor: 'violet',
  };
}

function getDocRefTag(doc: DocumentReference): { label: string; color: string } {
  const typeDisplay = doc.type?.coding?.[0]?.display || doc.type?.text;
  const categoryDisplay = doc.category?.[0]?.coding?.[0]?.display || doc.category?.[0]?.text;

  if (typeDisplay) {
    if (typeDisplay.toLowerCase().includes('lab')) {
      return { label: 'Lab', color: 'cyan' };
    }
    if (typeDisplay.toLowerCase().includes('insurance')) {
      return { label: 'Insurance', color: 'orange' };
    }
    if (typeDisplay.toLowerCase().includes('prior auth')) {
      return { label: 'Prior Auth', color: 'yellow' };
    }
    if (typeDisplay.toLowerCase().includes('addendum')) {
      return { label: 'Addendum', color: 'teal' };
    }
    return { label: typeDisplay, color: 'gray' };
  }

  if (categoryDisplay) {
    return { label: categoryDisplay, color: 'gray' };
  }

  return { label: 'Document', color: 'blue' };
}

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/tiff': 'TIFF',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
  'application/json': 'JSON',
  'text/plain': 'Text',
  'text/html': 'HTML',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
};

export function formatContentType(contentType: string | undefined): string | undefined {
  if (!contentType) {
    return undefined;
  }
  return CONTENT_TYPE_LABELS[contentType] ?? contentType.split('/')[1]?.toUpperCase();
}
