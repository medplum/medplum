// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Checks that a value has type `never`. Useful for ensuring exhaustive
 * matches.
 *
 * @example
 * ```typescript
 *   type MyUnion = 'a' | 'b' | 'c'
 *   function f(arg: MyUnion) {
 *     if (arg === 'a') { return 1; }
 *     if (arg === 'b') { return 2; }
 *     assertNever(arg); // Type error: 'c' is unhandled
 *   }
 * ```
 *
 * @param value - The value that should never be present
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}
