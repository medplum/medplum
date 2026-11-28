// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { getStatus, OperationOutcomeError } from '@medplum/core';

export function ifMatch(basic: { meta?: { versionId?: string } }): { headers: Record<string, string> } {
  if (!basic.meta?.versionId) {
    throw new Error('A version is required for a calendar state write');
  }
  return { headers: { 'If-Match': `W/"${basic.meta.versionId}"` } };
}

export function isVersionConflict(err: unknown): boolean {
  return err instanceof OperationOutcomeError && [409, 412].includes(getStatus(err.outcome));
}
