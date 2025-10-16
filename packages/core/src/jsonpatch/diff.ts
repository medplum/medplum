// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Forked from rfc6902, Copyright 2014-2021 Christopher Brown, MIT Licensed

import type { Pointer } from './pointer'; // we only need this for type inference
import { hasOwnProperty, objectType } from './util';

/**
 * All diff* functions should return a list of operations, often empty.
 *
 * Each operation should be an object with two to four fields:
 *   - `op`: the name of the operation; one of "add", "remove", "replace", "move", "copy", or "test".
 *   - `path`: a JSON pointer string
 *   - `from`: a JSON pointer string
 *   - `value`: a JSON value
 *
 * The different operations have different arguments.
 *   - "add": [`path`, `value`]
 *   - "remove": [`path`]
 *   - "replace": [`path`, `value`]
 *   - "move": [`from`, `path`]
 *   - "copy": [`from`, `path`]
 *   - "test": [`path`, `value`]
 *
 * Currently this only really differentiates between Arrays, Objects, and
 * Everything Else, which is pretty much just what JSON substantially
 * differentiates between.
 */

export interface AddOperation {
  op: 'add';
  path: string;
  value: any;
}
export interface RemoveOperation {
  op: 'remove';
  path: string;
}
export interface ReplaceOperation {
  op: 'replace';
  path: string;
  value: any;
}
export interface MoveOperation {
  op: 'move';
  from: string;
  path: string;
}
export interface CopyOperation {
  op: 'copy';
  from: string;
  path: string;
}
export interface TestOperation {
  op: 'test';
  path: string;
  value: any;
}

export type Operation =
  | AddOperation
  | RemoveOperation
  | ReplaceOperation
  | MoveOperation
  | CopyOperation
  | TestOperation;

export function isDestructive({ op }: Operation): boolean {
  return op === 'remove' || op === 'replace' || op === 'copy' || op === 'move';
}

export type Diff = (input: any, output: any, ptr: Pointer) => Operation[];

/**
 * VoidableDiff exists to allow the user to provide a partial diff(...) function,
 * falling back to the built-in diffAny(...) function if the user-provided function
 * returns void.
 */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export type VoidableDiff = (input: any, output: any, ptr: Pointer) => Operation[] | void;

/**
 * List the keys in `minuend` that are not in `subtrahend`.
 *
 * A key is only considered if it is both 1) an own-property (o.hasOwnProperty(k))
 * of the object, and 2) has a value that is not undefined. This is to match JSON
 * semantics, where JSON object serialization drops keys with undefined values.
 *
 * @param minuend - Object of interest
 * @param subtrahend - Object of comparison
 * @returns Array of keys that are in `minuend` but not in `subtrahend`.
 */
export function subtract(minuend: { [index: string]: any }, subtrahend: { [index: string]: any }): string[] {
  const keys: string[] = [];
  for (const key in minuend) {
    if (
      hasOwnProperty.call(minuend, key) &&
      minuend[key] !== undefined &&
      !(hasOwnProperty.call(subtrahend, key) && subtrahend[key] !== undefined)
    ) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * List the keys that shared by all `objects`.
 *
 * The semantics of what constitutes a "key" is described in {@link subtract}.
 *
 * @param objects - Array of objects to compare
 * @returns Array of keys that are in ("own-properties" of) every object in `objects`.
 */
export function intersection(objects: ArrayLike<{ [index: string]: any }>): string[] {
  const length = objects.length;
  // prepare empty counter to keep track of how many objects each key occurred in
  const counter: { [index: string]: number } = {};
  // go through each object and increment the counter for each key in that object
  for (let i = 0; i < length; i++) {
    const object = objects[i];
    for (const key in object) {
      if (hasOwnProperty.call(object, key) && object[key] !== undefined) {
        counter[key] = (counter[key] || 0) + 1;
      }
    }
  }
  // now delete all keys from the counter that were not seen in every object
  for (const key in counter) {
    if (counter[key] < length) {
      delete counter[key];
    }
  }
  // finally, extract whatever keys remain in the counter
  return Object.keys(counter);
}

/**
 * List the keys that shared by all `a` and `b`.
 *
 * The semantics of what constitutes a "key" is described in {@link subtract}.
 *
 * @param a - First object to compare
 * @param b - Second object to compare
 * @returns Array of keys that are in ("own-properties" of) `a` and `b`.
 */
function intersection2(a: { [index: string]: any }, b: { [index: string]: any }): string[] {
  const keys: string[] = [];
  for (const key in a) {
    if (hasOwnProperty.call(a, key) && a[key] !== undefined && hasOwnProperty.call(b, key) && b[key] !== undefined) {
      keys.push(key);
    }
  }
  return keys;
}

interface ArrayAdd {
  op: 'add';
  index: number;
  value: any;
}
interface ArrayRemove {
  op: 'remove';
  index: number;
}
interface ArrayReplace {
  op: 'replace';
  index: number;
  original: any;
  value: any;
}

/**
 * These are not proper Operation objects, but will be converted into
 * Operation objects eventually. {index} indicates the actual target position,
 * never 'end-of-array'
 */
type ArrayOperation = ArrayAdd | ArrayRemove | ArrayReplace;

function isArrayAdd(array_operation: ArrayOperation): array_operation is ArrayAdd {
  return array_operation.op === 'add';
}
function isArrayRemove(array_operation: ArrayOperation): array_operation is ArrayRemove {
  return array_operation.op === 'remove';
}

interface DynamicAlternative {
  operations: ArrayOperation[];
  /**
   * cost indicates the total cost of getting to this position.
   */
  cost: number;
}

function appendArrayOperation(base: DynamicAlternative, operation: ArrayOperation): DynamicAlternative {
  return {
    // the new operation must be pushed on the end
    operations: base.operations.concat(operation),
    cost: base.cost + 1,
  };
}

/**
 * Calculate the shortest sequence of operations to get from `input` to `output`,
 * using a dynamic programming implementation of the Levenshtein distance algorithm.
 *
 * To get from the input ABC to the output AZ we could just delete all the input
 * and say "insert A, insert Z" and be done with it. That's what we do if the
 * input is empty. But we can be smarter.
 *
 *           output
 *                A   Z
 *                -   -
 *           [0]  1   2
 * input A |  1  [0]  1
 *       B |  2  [1]  1
 *       C |  3   2  [2]
 *
 * 1) start at 0,0 (+0)
 * 2) keep A (+0)
 * 3) remove B (+1)
 * 4) replace C with Z (+1)
 *
 * If the `input` (source) is empty, they'll all be in the top row, resulting in an
 * array of 'add' operations.
 * If the `output` (target) is empty, everything will be in the left column,
 * resulting in an array of 'remove' operations.
 *
 * @param input - The source array
 * @param output - The target array
 * @param ptr - The pointer to the array itself, used to build child pointers
 * @param diff - The diff function to use for non-array child elements
 * @returns A list of add/remove/replace operations.
 */
export function diffArrays<T>(input: T[], output: T[], ptr: Pointer, diff: Diff = diffAny): Operation[] {
  // set up cost matrix (very simple initialization: just a map)
  const max_length = Math.max(input.length, output.length);
  const memo = new Map<number, DynamicAlternative>([[0, { operations: [], cost: 0 }]]);
  /**
   * Calculate the cheapest sequence of operations required to get from
   * input.slice(0, i) to output.slice(0, j).
   * There may be other valid sequences with the same cost, but none cheaper.
   *
   * @param i - The row in the layout above
   * @param j - The column in the layout above
   * @returns An object containing a list of operations, along with the total cost
   *         of applying them (+1 for each add/remove/replace operation)
   */
  function dist(i: number, j: number): DynamicAlternative {
    // memoized
    const memo_key = i * max_length + j;
    let memoized = memo.get(memo_key);
    if (memoized === undefined) {
      // TODO: this !diff(...).length usage could/should be lazy
      if (i > 0 && j > 0 && !diff(input[i - 1], output[j - 1], ptr.add(String(i - 1))).length) {
        // equal (no operations => no cost)
        memoized = dist(i - 1, j - 1);
      } else {
        const alternatives: DynamicAlternative[] = [];
        if (i > 0) {
          // NOT topmost row
          const remove_base = dist(i - 1, j);
          const remove_operation: ArrayRemove = {
            op: 'remove',
            index: i - 1,
          };
          alternatives.push(appendArrayOperation(remove_base, remove_operation));
        }
        if (j > 0) {
          // NOT leftmost column
          const add_base = dist(i, j - 1);
          const add_operation: ArrayAdd = {
            op: 'add',
            index: i - 1,
            value: output[j - 1],
          };
          alternatives.push(appendArrayOperation(add_base, add_operation));
        }
        if (i > 0 && j > 0) {
          // TABLE MIDDLE
          // supposing we replaced it, compute the rest of the costs:
          const replace_base = dist(i - 1, j - 1);
          // okay, the general plan is to replace it, but we can be smarter,
          // recursing into the structure and replacing only part of it if
          // possible, but to do so we'll need the original value
          const replace_operation: ArrayReplace = {
            op: 'replace',
            index: i - 1,
            original: input[i - 1],
            value: output[j - 1],
          };
          alternatives.push(appendArrayOperation(replace_base, replace_operation));
        }
        // the only other case, i === 0 && j === 0, has already been memoized

        // the meat of the algorithm:
        // sort by cost to find the lowest one (might be several ties for lowest)
        // [4, 6, 7, 1, 2].sort((a, b) => a - b) -> [ 1, 2, 4, 6, 7 ]
        const best = alternatives.sort((a, b) => a.cost - b.cost)[0];
        memoized = best;
      }
      memo.set(memo_key, memoized);
    }
    return memoized;
  }
  // handle weird objects masquerading as Arrays that don't have proper length
  // properties by using 0 for everything but positive numbers
  const input_length = isNaN(input.length) || input.length <= 0 ? 0 : input.length;
  const output_length = isNaN(output.length) || output.length <= 0 ? 0 : output.length;
  const array_operations = dist(input_length, output_length).operations;
  const [padded_operations] = array_operations.reduce<[Operation[], number]>(
    ([operations, padding], array_operation) => {
      if (isArrayAdd(array_operation)) {
        const padded_index = array_operation.index + 1 + padding;
        const index_token = padded_index < input_length + padding ? String(padded_index) : '-';
        const operation = {
          op: array_operation.op,
          path: ptr.add(index_token).toString(),
          value: array_operation.value,
        };
        // padding++ // maybe only if array_operation.index > -1 ?
        return [operations.concat(operation), padding + 1];
      } else if (isArrayRemove(array_operation)) {
        const operation = {
          op: array_operation.op,
          path: ptr.add(String(array_operation.index + padding)).toString(),
        };
        // padding--
        return [operations.concat(operation), padding - 1];
      } else {
        // replace
        const replace_ptr = ptr.add(String(array_operation.index + padding));
        const replace_operations = diff(array_operation.original, array_operation.value, replace_ptr);
        return [operations.concat(...replace_operations), padding];
      }
    },
    [[], 0]
  );
  return padded_operations;
}

export function diffObjects(input: any, output: any, ptr: Pointer, diff: Diff = diffAny): Operation[] {
  // if a key is in input but not output -> remove it
  const operations: Operation[] = [];
  subtract(input, output).forEach((key) => {
    operations.push({ op: 'remove', path: ptr.add(key).toString() });
  });
  // if a key is in output but not input -> add it
  subtract(output, input).forEach((key) => {
    operations.push({ op: 'add', path: ptr.add(key).toString(), value: output[key] });
  });
  // if a key is in both, diff it recursively
  intersection2(input, output).forEach((key) => {
    operations.push(...diff(input[key], output[key], ptr.add(key)));
  });
  return operations;
}

/**
 * `diffAny()` returns an empty array if `input` and `output` are materially equal
 * (i.e., would produce equivalent JSON); otherwise it produces an array of patches
 * that would transform `input` into `output`.
 *
 * > Here, "equal" means that the value at the target location and the
 * > value conveyed by "value" are of the same JSON type, and that they
 * > are considered equal by the following rules for that type:
 * > o  strings: are considered equal if they contain the same number of
 * >    Unicode characters and their code points are byte-by-byte equal.
 * > o  numbers: are considered equal if their values are numerically
 * >    equal.
 * > o  arrays: are considered equal if they contain the same number of
 * >    values, and if each value can be considered equal to the value at
 * >    the corresponding position in the other array, using this list of
 * >    type-specific rules.
 * > o  objects: are considered equal if they contain the same number of
 * >    members, and if each member can be considered equal to a member in
 * >    the other object, by comparing their keys (as strings) and their
 * >    values (using this list of type-specific rules).
 * > o  literals (false, true, and null): are considered equal if they are
 * >    the same.
 *
 * @param input - The source value
 * @param output - The target value
 * @param ptr - The pointer to the value itself, used to build child pointers
 * @param diff - The diff function to use for non-primitive child elements
 * @returns The list of operations required to transform `input` into `output`
 */
export function diffAny(input: any, output: any, ptr: Pointer, diff: Diff = diffAny): Operation[] {
  // strict equality handles literals, numbers, and strings (a sufficient but not necessary cause)
  if (input === output) {
    return [];
  }
  const input_type = objectType(input);
  const output_type = objectType(output);
  if (input_type === 'array' && output_type === 'array') {
    return diffArrays(input, output, ptr, diff);
  }
  if (input_type === 'object' && output_type === 'object') {
    return diffObjects(input, output, ptr, diff);
  }
  // at this point we know that input and output are materially different;
  // could be array -> object, object -> array, boolean -> undefined,
  // number -> string, or some other combination, but nothing that can be split
  // up into multiple patches: so `output` must replace `input` wholesale.
  return [{ op: 'replace', path: ptr.toString(), value: output }];
}
