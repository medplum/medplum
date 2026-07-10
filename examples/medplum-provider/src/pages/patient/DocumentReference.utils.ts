// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DocumentReference } from '@medplum/fhirtypes';

export function getDocumentTypeDisplay(doc: DocumentReference): string | undefined {
  return doc.type?.coding?.[0]?.display || doc.type?.text;
}
