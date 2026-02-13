// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, normalizeOperationOutcome, OperationOutcomeError } from '@medplum/core';
import type { Operation } from 'rfc6902';
import { applyPatch } from 'rfc6902';

/**
 * Applies a JSON patch to an object in-place.
 * Throws an error if the patch is invalid.
 *
 * @param obj - The original object to be patched.
 * @param patch - The patch to apply.
 */
export function patchObject(obj: any, patch: Operation[]): void {
  // Pre-process: ensure parent arrays exist for 'add' operations with '/-' path suffix.
  // Per RFC 6902, 'add' with '/-' should append to an array. When the array
  // doesn't exist yet, we create it so the append operation can succeed.
  for (const op of patch) {
    if (op.op === 'add' && op.path.endsWith('/-')) {
      const parentPath = op.path.slice(0, -2);
      const segments = parentPath.split('/').filter(Boolean);
      let current: any = obj;
      for (let i = 0; i < segments.length; i++) {
        const segment = decodeURIComponent(segments[i].replace(/~1/g, '/').replace(/~0/g, '~'));
        if (i === segments.length - 1) {
          if (current[segment] === undefined || current[segment] === null) {
            current[segment] = [];
          }
        } else {
          if (current[segment] === undefined || current[segment] === null) {
            break;
          }
          current = current[segment];
        }
      }
    }
  }

  try {
    const patchErrors = applyPatch(obj, patch).filter(Boolean);
    if (patchErrors.length) {
      throw new OperationOutcomeError(badRequest(patchErrors.map((e) => (e as Error).message).join('\n')));
    }
  } catch (err) {
    throw new OperationOutcomeError(normalizeOperationOutcome(err), { cause: err });
  }
}
