// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DocumentReference } from '@medplum/fhirtypes';

/** Human-readable label for a document's type: the first coding's display, falling back to free text. */
export function getDocumentTypeDisplay(doc: DocumentReference): string | undefined {
  return doc.type?.coding?.[0]?.display || doc.type?.text;
}
