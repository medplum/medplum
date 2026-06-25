// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DocumentReference } from '@medplum/fhirtypes';

/**
 * Returns a human-readable name for a DocumentReference: its description, falling back to the
 * first attachment's title, then a generic label.
 * @param doc - The DocumentReference to name.
 * @returns The display name.
 */
export function getDocumentName(doc: DocumentReference): string {
  return doc.description || doc.content?.[0]?.attachment?.title || 'Untitled Document';
}

/**
 * Returns the human-readable type of a DocumentReference (its FHIR `type` display or text),
 * or undefined when no type is set.
 * @param doc - The DocumentReference to read the type from.
 * @returns The type display or text, or undefined.
 */
export function getDocumentTypeDisplay(doc: DocumentReference): string | undefined {
  return doc.type?.coding?.[0]?.display || doc.type?.text;
}

export type DocumentSource = 'Lab' | 'Upload';

/**
 * Classifies a DocumentReference as a lab artifact or a manual upload, based on its type display.
 * @param doc - The DocumentReference to classify.
 * @returns The document source.
 */
export function getDocumentSource(doc: DocumentReference): DocumentSource {
  return (getDocumentTypeDisplay(doc) ?? '').toLowerCase().includes('lab') ? 'Lab' : 'Upload';
}
