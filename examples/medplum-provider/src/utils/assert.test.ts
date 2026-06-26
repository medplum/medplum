// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { assertNever } from './assert';

describe('assertNever', () => {
  test('throws with the unexpected value in the message', () => {
    expect(() => assertNever('oops' as never)).toThrow('Unexpected value: oops');
  });

  test('triggers typescript error when a union type is not fully handled', () => {
    type MyUnion = 'a' | 'b' | 'c';

    function handle(arg1: MyUnion): number {
      if (arg1 === 'a') {
        return 1;
      }

      if (arg1 === 'b') {
        return 2;
      }

      // @ts-expect-error We didn't handle `c` from the union, so this assertion is triggered
      return assertNever(arg1);
    }

    expect(handle('a')).toBe(1);
    expect(() => handle('c')).toThrow('Unexpected value: c');
  });

  test('is usable as an exhaustive check in a switch statement', () => {
    type AB = 'a' | 'b';

    function handle(x: AB): number {
      switch (x) {
        case 'a':
          return 1;
        case 'b':
          return 2;
        default:
          assertNever(x);
          return -1; // unreachable
      }
    }

    expect(handle('a')).toBe(1);
    expect(handle('b')).toBe(2);
  });
});
