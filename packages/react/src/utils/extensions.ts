// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getPathDisplayName } from '@medplum/core';

/**
 * Derives a human-friendly display name for an extension from its URL.
 *
 * Uses the last meaningful segment of the URL (after the final `/` or `#`) and humanizes it,
 * e.g. `http://hl7.org/fhir/StructureDefinition/patient-birthPlace` becomes "Patient Birth Place".
 * Falls back to the full URL when no usable segment is found, or "Extension" when the URL is empty.
 *
 * @param url - The extension URL.
 * @returns A human-friendly display name for the extension.
 */
export function getExtensionDisplayName(url: string | undefined): string {
  if (!url) {
    return 'Extension';
  }
  const lastSegment = url.split(/[/#]/).filter(Boolean).pop();
  if (!lastSegment) {
    return url;
  }
  return getPathDisplayName(lastSegment) || url;
}
