// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { normalizeErrorString } from '@medplum/core';

export function formatPurpose(purpose: string): string {
  switch (purpose) {
    case 'auth-requirements':
      return 'Auth Requirements';
    case 'benefits':
      return 'Benefits';
    case 'discovery':
      return 'Discovery';
    case 'validation':
      return 'Validation';
    default:
      return purpose;
  }
}

/**
 * Message to show for a failed bot operation such as `$submit`. A bot that throws returns its runtime error payload
 * (`{ errorType, errorMessage, trace }`) as the response body, which the client surfaces as a JSON string;
 * this unwraps `errorMessage` from that payload and otherwise falls back to the normalized error string.
 * @param err - The error thrown by the `$submit` call.
 * @returns A human-readable message.
 */
export function getErrorMessage(err: unknown): string {
  const message = normalizeErrorString(err);
  try {
    const payload: unknown = JSON.parse(message);
    if (
      payload &&
      typeof payload === 'object' &&
      'errorMessage' in payload &&
      typeof payload.errorMessage === 'string'
    ) {
      return payload.errorMessage;
    }
  } catch {
    return message;
  }
  return message;
}
