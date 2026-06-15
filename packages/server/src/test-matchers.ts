// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { equals, iterableEquality } from '@jest/expect-utils';
import { expect } from 'vitest';

interface CustomMatchers<R = unknown> {
  /**
   * Passes when `received` is an array with the same length as `expected`
   * and every entry in `expected` deep-equals a distinct entry in `received`,
   * regardless of order. Supports asymmetric matchers in `expected`.
   */
  toEqualUnordered(expected: readonly unknown[]): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
  toEqualUnordered(received: unknown, expected: readonly unknown[]) {
    const utils = this.utils;
    if (!Array.isArray(received)) {
      return {
        pass: false,
        message: () => `expected an array, received ${utils.printReceived(received)}`,
      };
    }
    if (received.length !== expected.length) {
      return {
        pass: false,
        message: () =>
          `expected array of length ${utils.printExpected(expected.length)}, ` +
          `received length ${utils.printReceived(received.length)}\n\n` +
          `Expected: ${utils.printExpected(expected)}\n` +
          `Received: ${utils.printReceived(received)}`,
      };
    }
    const remaining = [...received];
    const customTesters = [...this.customTesters, iterableEquality];
    for (const item of expected) {
      const idx = remaining.findIndex((r) => equals(r, item, customTesters));
      if (idx === -1) {
        return {
          pass: false,
          message: () =>
            `expected received array to contain an entry equal to ${utils.printExpected(item)}\n\n` +
            `Expected: ${utils.printExpected(expected)}\n` +
            `Received: ${utils.printReceived(received)}`,
        };
      }
      remaining.splice(idx, 1);
    }
    return {
      pass: true,
      message: () =>
        `expected received array not to equal (unordered) ${utils.printExpected(expected)}\n\n` +
        `Received: ${utils.printReceived(received)}`,
    };
  },
});
