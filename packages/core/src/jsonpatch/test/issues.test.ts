// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Forked from rfc6902, Copyright 2014-2021 Christopher Brown, MIT Licensed

import type { Operation, VoidableDiff } from '../diff';
import { applyPatch, createPatch } from '../index';
import type { Pointer } from '../pointer';
import { clone } from '../util';

function checkRoundtrip(
  input: any,
  output: any,
  expected_patch: Operation[],
  diff?: VoidableDiff,
  actual_patch: Operation[] = createPatch(input, output, diff)
): void {
  expect(actual_patch).toStrictEqual(expected_patch);
  const actual_output = clone(input);
  const patch_results = applyPatch(actual_output, actual_patch);
  expect(actual_output).toStrictEqual(output);
  expect(patch_results.length).toBe(actual_patch.length);
  expect(patch_results.every((result) => result === null)).toBe(true);
}

test('issues/3', () => {
  const input = { arr: ['1', '2', '2'] };
  const output = { arr: ['1'] };
  const expected_patch: Operation[] = [
    { op: 'remove', path: '/arr/1' },
    { op: 'remove', path: '/arr/1' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/4', () => {
  const input = ['A', 'B'];
  const output = ['B', 'A'];
  const expected_patch: Operation[] = [
    { op: 'add', path: '/0', value: 'B' },
    { op: 'remove', path: '/2' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/5', () => {
  const input: string[] = [];
  const output = ['A', 'B'];
  const expected_patch: Operation[] = [
    { op: 'add', path: '/-', value: 'A' },
    { op: 'add', path: '/-', value: 'B' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/9', () => {
  const input = [{ A: 1, B: 2 }, { C: 3 }];
  const output = [{ A: 1, B: 20 }, { C: 3 }];
  const expected_patch: Operation[] = [{ op: 'replace', path: '/0/B', value: 20 }];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/12', () => {
  const input = { name: 'ABC', repositories: ['a', 'e'] };
  const output = { name: 'ABC', repositories: ['a', 'b', 'c', 'd', 'e'] };
  const expected_patch: Operation[] = [
    { op: 'add', path: '/repositories/1', value: 'b' },
    { op: 'add', path: '/repositories/2', value: 'c' },
    { op: 'add', path: '/repositories/3', value: 'd' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/15', () => {
  const customDiff: VoidableDiff = (input: any, output: any, ptr: Pointer) => {
    if (input instanceof Date && output instanceof Date && input.valueOf() !== output.valueOf()) {
      return [{ op: 'replace', path: ptr.toString(), value: output }];
    }
    return undefined;
  };
  const input = { date: new Date(0) };
  const output = { date: new Date(1) };
  const expected_patch: Operation[] = [{ op: 'replace', path: '/date', value: new Date(1) }];
  checkRoundtrip(input, output, expected_patch, customDiff);
});

test('issues/15/array', () => {
  const customDiff: VoidableDiff = (input: any, output: any, ptr: Pointer) => {
    if (input instanceof Date && output instanceof Date && input.valueOf() !== output.valueOf()) {
      return [{ op: 'replace', path: ptr.toString(), value: output }];
    }
    return undefined;
  };
  const input = [new Date(0)];
  const output = [new Date(1)];
  const expected_patch: Operation[] = [{ op: 'replace', path: '/0', value: new Date(1) }];
  checkRoundtrip(input, output, expected_patch, customDiff);
});

test('issues/29', () => {
  /**
   * Custom diff function that short-circuits recursion when the last token
   * in the current pointer is the key "stop_recursing", such that that key's
   * values are compared as primitives rather than objects/arrays.
   *
   * @param input - The input value at the current pointer.
   * @param output - The output value at the current pointer.
   * @param ptr - The current JSON Pointer.
   * @returns An array of Operations to apply, or undefined to continue default diffing.
   */
  const customDiff: VoidableDiff = (input: any, output: any, ptr: Pointer) => {
    if (ptr.tokens[ptr.tokens.length - 1] === 'stop_recursing') {
      // do not compare arrays, replace instead
      return [{ op: 'replace', path: ptr.toString(), value: output }];
    }
    return undefined;
  };

  const input = {
    normal: ['a', 'b'],
    stop_recursing: ['a', 'b'],
  };
  const output = {
    normal: ['a'],
    stop_recursing: ['a'],
  };
  const expected_patch: Operation[] = [
    { op: 'remove', path: '/normal/1' },
    { op: 'replace', path: '/stop_recursing', value: ['a'] },
  ];
  const actual_patch = createPatch(input, output, customDiff);
  checkRoundtrip(input, output, expected_patch, null as unknown as undefined, actual_patch);

  const nested_input = { root: input };
  const nested_output = { root: output };
  const nested_expected_patch: Operation[] = [
    { op: 'remove', path: '/root/normal/1' },
    { op: 'replace', path: '/root/stop_recursing', value: ['a'] },
  ];
  const nested_actual_patch = createPatch(nested_input, nested_output, customDiff);
  checkRoundtrip(nested_input, nested_output, nested_expected_patch, null as unknown as undefined, nested_actual_patch);
});

test('issues/32', () => {
  const input = 'a';
  const output = 'b';
  const expected_patch: Operation[] = [{ op: 'replace', path: '', value: 'b' }];
  const actual_patch = createPatch(input, output);
  expect(actual_patch).toStrictEqual(expected_patch);
  const actual_output = clone(input);
  const results = applyPatch(input, actual_patch);
  expect(actual_output).toBe('a');
  expect(results.map((r) => (r === null ? 'null' : r.name))).toStrictEqual(['MissingError']);
});

test('issues/33', () => {
  const object = { root: { 0: 4 } };
  const array = { root: [4] };
  checkRoundtrip(object, array, [{ op: 'replace', path: '/root', value: [4] }]);
  checkRoundtrip(array, object, [{ op: 'replace', path: '/root', value: { 0: 4 } }]);
});

test('issues/34', () => {
  const input = [3, 4];
  const output = [undefined, 4];
  const expected_patch: Operation[] = [{ op: 'replace', path: '/0', value: undefined }];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/35', () => {
  const input = { name: 'bob', image: undefined, cat: null };
  const output = { name: 'bob', image: 'foo.jpg', cat: 'nikko' };
  const expected_patch: Operation[] = [
    { op: 'add', path: '/image', value: 'foo.jpg' },
    { op: 'replace', path: '/cat', value: 'nikko' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/36', () => {
  const input = [undefined, 'B']; // same as: const input = ['A', 'B']; delete input[0]
  const output = ['A', 'B'];
  const expected_patch: Operation[] = [
    // could also be {op: 'add', ...} -- the spec isn't clear on what constitutes existence for arrays
    { op: 'replace', path: '/0', value: 'A' },
  ];
  checkRoundtrip(input, output, expected_patch);
});

test('issues/37', () => {
  const value = { id: 'chbrown' };
  const patch_results = applyPatch(value, [{ op: 'copy', from: '/id', path: '/name' }]);
  const expected_value = { id: 'chbrown', name: 'chbrown' };
  expect(value).toStrictEqual(expected_value);
  expect(patch_results.every((result) => result === null)).toBe(true);
});

test('issues/38', () => {
  const value = {
    current: { timestamp: 23 },
    history: [],
  };
  const patch_results = applyPatch(value, [
    { op: 'copy', from: '/current', path: '/history/-' },
    { op: 'replace', path: '/current/timestamp', value: 24 },
    { op: 'copy', from: '/current', path: '/history/-' },
  ]);
  const expected_value = {
    current: { timestamp: 24 },
    history: [{ timestamp: 23 }, { timestamp: 24 }],
  };
  expect(value).toStrictEqual(expected_value);
  expect(patch_results.every((result) => result === null)).toBe(true);
});

test('issues/44', () => {
  const value = {};
  const author = { firstName: 'Chris' };
  const patch_results = applyPatch(value, [
    { op: 'add', path: '/author', value: author },
    { op: 'add', path: '/author/lastName', value: 'Brown' },
  ]);
  const expected_value = {
    author: { firstName: 'Chris', lastName: 'Brown' },
  };
  expect(value).toStrictEqual(expected_value);
  expect(patch_results.every((result) => result === null)).toBe(true);
  expect(author).toStrictEqual({ firstName: 'Chris' });
});

test('issues/76', () => {
  expect(({} as any).polluted).toBeUndefined();
  const value = {};
  applyPatch(value, [{ op: 'add', path: '/__proto__/polluted', value: 'Hello!' }]);
  expect(({} as any).polluted).toBeUndefined();
});

test('issues/78', () => {
  const user: Record<string, unknown> = { firstName: 'Chris' };
  const patch_results = applyPatch(user, [{ op: 'add', path: '/createdAt', value: new Date('2010-08-10T22:10:48Z') }]);
  expect(patch_results.every((result) => result === null)).toBe(true);
  expect((user['createdAt'] as Date).getTime()).toBe(1281478248000);
});

test('issues/97', () => {
  const commits: string[] = [];
  const user = { firstName: 'Chris', commits: ['80f1243'] };
  const patch_results = applyPatch(user, [
    { op: 'replace', path: '/commits', value: commits },
    { op: 'add', path: '/commits/-', value: '5d565c8' },
  ]);
  expect(patch_results.every((result) => result === null)).toBe(true);
  expect(user).toStrictEqual({ firstName: 'Chris', commits: ['5d565c8'] });
  expect(commits.length).toBe(0);
});
