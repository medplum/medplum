// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Helper function to narrow a type by excluding undefined/null values.
//
// Example usage:
//   const arr: Array<number | undefined> = [1,undefined];
//   const refined = arr.filter(isDefined); // `refined` has type Array<number>
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}
