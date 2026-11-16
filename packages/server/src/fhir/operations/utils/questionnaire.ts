// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError } from '@medplum/core';

/**
 * Splits a Questionnaire canonical without confusing business versions with resource history.
 * @param canonical - URL with an optional business version.
 * @returns URL and optional version for separate search filters.
 */
export function parseQuestionnaireCanonical(canonical: string): { url: string; version?: string } {
  const parts = canonical.split('|');
  if (
    !parts[0] ||
    parts.length > 2 ||
    (parts.length === 2 && !parts[1]) ||
    /\s|#/.test(canonical) ||
    canonical.includes('/_history/')
  ) {
    throw new OperationOutcomeError(
      badRequest(
        'Expected a Questionnaire URL with an optional |version; fragments and history references are unsupported'
      )
    );
  }
  return { url: parts[0], version: parts[1] };
}
