// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Operation } from 'rfc6902';
import { patchObject } from './patch';

describe('Patch utils', () => {
  test('Add success', () => {
    const input = { foo: 'bar' };
    const patch: Operation[] = [{ op: 'add', path: '/baz', value: 'qux' }];
    patchObject(input, patch);
    expect(input).toEqual({ foo: 'bar', baz: 'qux' });
  });

  test('Malformed patch', () => {
    const input = { foo: 'bar' };
    const patch = [{ op: 'invalid' }] as unknown as Operation[];
    expect(() => patchObject(input, patch)).toThrow('Invalid operation: invalid');
  });

  test('Test failure', () => {
    const input = { foo: 'bar' };
    const patch: Operation[] = [{ op: 'test', path: '/x', value: 'x' }];
    expect(() => patchObject(input, patch)).toThrow('Test failed: undefined != x');
  });
});
