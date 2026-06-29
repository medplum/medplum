// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Operation } from '@medplum/core';
import { applyPatch, badRequest, normalizeOperationOutcome, OperationOutcomeError } from '@medplum/core';

const patchOptions = { implicitArrayCreation: true };

/**
 * Applies a JSON patch to an object in-place.
 * Throws an error if the patch is invalid.
 *
 * @param obj - The original object to be patched.
 * @param patch - The patch to apply.
 */
export function patchObject(obj: any, patch: Operation[]): void {
  try {
    const patchErrors = applyPatch(obj, patch, patchOptions).filter(Boolean);
    if (patchErrors.length) {
      throw new OperationOutcomeError(badRequest(patchErrors.map((e) => (e as Error).message).join('\n')));
    }
  } catch (err) {
    throw new OperationOutcomeError(normalizeOperationOutcome(err), { cause: err });
  }
}
