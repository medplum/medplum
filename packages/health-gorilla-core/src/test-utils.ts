// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { expect } from 'vitest';

/**
 * Ensures that a variable is not undefined and makes the same type assertion. Can be used in
 * place of `expect(value).toBeDefined()`.
 * @param value - The value to check.
 * @param message - (optional) The message to display if the assertion fails.
 */
export function expectToBeDefined<T>(value: T | undefined, message?: string): asserts value is T {
  expect(value, message).toBeDefined();
}
