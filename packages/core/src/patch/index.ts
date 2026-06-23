/* eslint-disable header/header */
/*
 * Copyright © 2014-2021 Christopher Brown <io@henrian.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { Pointer } from './pointer';
export { Pointer };

import type { Diff, Operation, TestOperation, VoidableDiff } from './diff';
import { diffAny, isDestructive } from './diff';
import type { InvalidOperationError, MissingError, Options, TestError } from './patch';
import { apply } from './patch';

export type { Operation, Options, TestOperation };
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
 * @param object - The object to apply the patch to
 * @param patch - Array of operations to apply
 * @param options - Optional customization of patch application behavior
 * @returns list of results, one for each operation: `null` indicated success,
 *     otherwise, the result will be an instance of one of the Error classes.
 */
export function applyPatch(
  object: any,
  patch: Operation[],
  options?: Options
): (null | MissingError | InvalidOperationError | TestError)[] {
  return patch.map((operation) => apply(object, operation, options));
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
 * Returns list of operations to perform on `input` to produce `output`.
 *
 * @param input - The input value.
 * @param output - The target value.
 * @param diff - Optional diff function.
 * @returns The list of patch operations.
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
 * @param input - The input value.
 * @param path - The path to create a test for.
 * @returns A test operation, if a value exists at the given path.
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
 * Returns list of test operations.
 *
 * @param input - The input value.
 * @param patch - The list of patch operations.
 * @returns A list of test operations corresponding to the current values.
 */
export function createTests(input: any, patch: Operation[]): TestOperation[] {
  const tests = new Array<TestOperation>();
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
