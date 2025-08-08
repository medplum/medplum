// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, normalizeOperationOutcome, OperationOutcomeError } from '@medplum/core';
import { applyPatch, Operation } from 'rfc6902';

/**
 * Applies a JSON patch to an object in-place.
 * Throws an error if the patch is invalid.
 *
 * @param obj - The original object to be patched.
 * @param patch - The patch to apply.
 */
export function patchObject(obj: any, patch: Operation[]): void {
  try {
    const patchErrors = applyPatch(obj, patch).filter(Boolean);
    if (patchErrors.length) {
      throw new OperationOutcomeError(badRequest(patchErrors.map((e) => (e as Error).message).join('\n')));
    }
  } catch (err) {
    throw new OperationOutcomeError(normalizeOperationOutcome(err), err);
  }
}
