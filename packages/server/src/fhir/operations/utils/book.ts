// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// JS `%` operator is "remainder", not "modulo", and can return negative numbers.
// Introducing our own mod function lets us guarantee that the result is in the
// range [0, d).
// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder
function mod(n: number, d: number): number {
  return ((n % d) + d) % d;
}

/**
 * Tests whether a given time matches alignment parameters.
 *
 * @param time - The time to test
 * @param options - The alignment parameters
 * @param options.alignment - An hour divisor to align to; should be in range [1, 60]
 * @param options.offsetMinutes - A number of minutes to offset the alignment by
 * @returns True if the time matches the alignment, false otherwise
 */
export function isAlignedTime(
  time: Date,
  options: {
    alignment: number;
    offsetMinutes: number;
  }
): boolean {
  // Time must be on a minute boundary (no seconds or milliseconds)
  if (time.getSeconds() !== 0 || time.getMilliseconds() !== 0) {
    return false;
  }

  // Check if the minutes match the alignment offset
  return mod(time.getMinutes() - options.offsetMinutes, options.alignment) === 0;
}
