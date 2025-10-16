// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Forked from rfc6902, Copyright 2014-2021 Christopher Brown, MIT Licensed

import type { Diff, Operation, TestOperation, VoidableDiff } from './diff';
import { diffAny, isDestructive } from './diff';
import type { InvalidOperationError, MissingError, TestError } from './patch';
import { apply } from './patch';
import { Pointer } from './pointer';

export { Pointer };
export type { Operation, TestOperation };
export type Patch = Operation[];

/**
 * Apply a 'application/json-patch+json'-type patch to an object.
 *
 * `patch` *must* be an array of operations.
 *
 * > Operation objects MUST have exactly one "op" member, whose value
 * > indicates the operation to perform.  Its value MUST be one of "add",
 * > "remove", "replace", "move", "copy", or "test"; other values are
 * > errors.
 *
 * This method mutates the target object in-place.
 *
 * @param object - The object to apply the patch to.
 * @param patch - The patch to apply.
 * @returns list of results, one for each operation: `null` indicated success,
 *          otherwise, the result will be an instance of one of the Error classes:
 *          MissingError, InvalidOperationError, or TestError.
 */
export function applyPatch(
  object: any,
  patch: Operation[]
): (MissingError | InvalidOperationError | TestError | null)[] {
  return patch.map((operation) => apply(object, operation));
}

function wrapVoidableDiff(diff: VoidableDiff): Diff {
  function wrappedDiff(input: any, output: any, ptr: Pointer): Operation[] {
    const custom_patch = diff(input, output, ptr);
    // ensure an array is always returned
    return Array.isArray(custom_patch) ? custom_patch : diffAny(input, output, ptr, wrappedDiff);
  }
  return wrappedDiff;
}

/**
 * Produce a 'application/json-patch+json'-type patch to get from one object to
 * another.
 *
 * This does not alter `input` or `output` unless they have a property getter with
 * side-effects (which is not a good idea anyway).
 *
 * `diff` is called on each pair of comparable non-primitive nodes in the
 * `input`/`output` object trees, producing nested patches. Return `undefined`
 * to fall back to default behaviour.
 *
 * @param input - The input object.
 * @param output - The output object.
 * @param diff - Optional custom diff function.
 * @returns List of operations to perform on `input` to produce `output`.
 */
export function createPatch(input: any, output: any, diff?: VoidableDiff): Operation[] {
  const ptr = new Pointer();
  // a new Pointer gets a default path of [''] if not specified
  return (diff ? wrapVoidableDiff(diff) : diffAny)(input, output, ptr);
}

/**
 * Create a test operation based on `input`'s current evaluation of the JSON
 * Pointer `path`; if such a pointer cannot be resolved, returns undefined.
 *
 * @param input - The input object.
 * @param path - The JSON Pointer path.
 * @returns A TestOperation or undefined.
 */
function createTest(input: any, path: string): TestOperation | undefined {
  const endpoint = Pointer.fromJSON(path).evaluate(input);
  if (endpoint !== undefined) {
    return { op: 'test', path, value: endpoint.value };
  }
  return undefined;
}

/**
 * Produce an 'application/json-patch+json'-type list of tests, to verify that
 * existing values in an object are identical to the those captured at some
 * checkpoint (whenever this function is called).
 *
 * This does not alter `input` or `output` unless they have a property getter with
 * side-effects (which is not a good idea anyway).
 *
 * @param input - The input object.
 * @param patch - The patch to be applied later.
 * @returns List of test operations to perform before applying `patch`.
 */
export function createTests(input: any, patch: Operation[]): TestOperation[] {
  const tests: TestOperation[] = [];
  patch.filter(isDestructive).forEach((operation) => {
    const pathTest = createTest(input, operation.path);
    if (pathTest) {
      tests.push(pathTest);
    }
    if ('from' in operation) {
      const fromTest = createTest(input, operation.from);
      if (fromTest) {
        tests.push(fromTest);
      }
    }
  });
  return tests;
}
