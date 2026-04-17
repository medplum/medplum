// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Like Array#flatMap(), but breaks out of the iteration once
 * the maxCount of results has been reached. Passes the remaining
 * count to be used into the mapper function as an extra argument.
 * @param arr - The array to flatMap over
 * @param mapper - The callback for each array entry to be passed to
 * @param maxCount - The maximum size of the result array
 * @returns An array representing the result of calling the mapper with each
 *   element of the input array, capped at length `maxCount`
 */
export function flatMapMax<T, R>(
  arr: T[],
  mapper: (obj: T, idx: number, count: number) => R | R[],
  maxCount: number
): R[] {
  let result: R[] = [];
  for (const [idx, obj] of arr.entries()) {
    result = result.concat(mapper(obj, idx, maxCount - result.length));
    if (result.length >= maxCount) {
      break;
    }
  }
  if (result.length > maxCount) {
    return result.slice(0, maxCount);
  }
  return result;
}
